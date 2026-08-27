"""Deterministic embeddings + heuristic triage.

Works offline for the demo. If OPENAI_API_KEY is set, embeddings and
summaries prefer the API; otherwise we use a hashed bag-of-words vector
and extractive summaries so judges can still see the full innovation layer.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter

import httpx
import numpy as np
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Issue, Priority, Severity, User

DIM = 256
STOP = {
    "the", "a", "an", "and", "or", "to", "of", "in", "on", "for", "is", "it",
    "this", "that", "with", "from", "as", "at", "by", "be", "are", "was", "were",
    "we", "i", "you", "they", "not", "but", "if", "then", "when", "can", "will",
}


def tokenize(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in STOP and len(t) > 1]


def hash_embed(text: str) -> list[float]:
    vec = np.zeros(DIM, dtype=np.float32)
    tokens = tokenize(text)
    if not tokens:
        return vec.tolist()
    for tok in tokens:
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % DIM] += 1.0
        vec[(h // DIM) % DIM] -= 0.35
    norm = np.linalg.norm(vec)
    if norm:
        vec = vec / norm
    return vec.tolist()


async def openai_embed(text: str) -> list[float] | None:
    if not settings.openai_api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            r = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={"model": "text-embedding-3-small", "input": text[:8000]},
            )
            r.raise_for_status()
            return r.json()["data"][0]["embedding"]
    except Exception:
        return None


async def embed_text(text: str) -> list[float]:
    api = await openai_embed(text)
    return api if api else hash_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a, dtype=np.float32), np.array(b, dtype=np.float32)
    if va.shape != vb.shape:
        n = min(len(va), len(vb))
        va, vb = va[:n], vb[:n]
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    if not na or not nb:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def dump_embedding(vec: list[float]) -> str:
    return json.dumps(vec)


def load_embedding(raw: str) -> list[float] | None:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


SEVERITY_HINTS = [
    (Severity.blocker, ["crash", "data loss", "outage", "cannot boot", "security", "rce", "p0", "down"]),
    (Severity.critical, ["exception", "500", "segfault", "corrupt", "auth bypass", "login broken"]),
    (Severity.major, ["broken", "fails", "error", "regression", "timeout", "slow query"]),
    (Severity.minor, ["typo", "ui", "spacing", "copy", "warning"]),
    (Severity.trivial, ["nit", "cosmetic", "docs", "comment"]),
]


def suggest_severity(title: str, description: str) -> tuple[Severity, float]:
    blob = f"{title} {description}".lower()
    for sev, words in SEVERITY_HINTS:
        if any(w in blob for w in words):
            return sev, 0.78 if sev in (Severity.blocker, Severity.critical) else 0.64
    return Severity.major, 0.42


def suggest_priority(severity: Severity) -> Priority:
    return {
        Severity.blocker: Priority.P0,
        Severity.critical: Priority.P1,
        Severity.major: Priority.P2,
        Severity.minor: Priority.P3,
        Severity.trivial: Priority.P4,
    }[severity]


def extractive_summary(comments: list[str], title: str) -> str:
    if not comments:
        return f"No discussion yet. Issue: {title}"
    text = " ".join(comments)
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]
    if not sentences:
        return comments[-1][:220]
    scored = []
    df = Counter(tokenize(" ".join(sentences)))
    for s in sentences[:40]:
        toks = tokenize(s)
        score = sum(df[t] for t in toks) / (len(toks) ** 0.5) if toks else 0
        scored.append((score, s))
    top = [s for _, s in sorted(scored, reverse=True)[:2]]
    return " ".join(top)[:400]


async def llm_summary(title: str, comments: list[str]) -> str | None:
    if not settings.openai_api_key and not settings.anthropic_api_key:
        return None
    joined = "\n".join(f"- {c[:400]}" for c in comments[-25:])
    prompt = (
        f"Summarize this bug discussion in two short sentences for a busy maintainer.\n"
        f"Title: {title}\nComments:\n{joined}"
    )
    try:
        if settings.anthropic_api_key:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": settings.anthropic_api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-3-5-haiku-20241022",
                        "max_tokens": 160,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                r.raise_for_status()
                return r.json()["content"][0]["text"]
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 160,
                },
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
    except Exception:
        return None


def find_duplicates(db: Session, project_id: int, embedding: list[float], exclude_id: int | None = None, k: int = 5):
    q = db.query(Issue).filter(Issue.project_id == project_id, Issue.embedding != "")
    if exclude_id:
        q = q.filter(Issue.id != exclude_id)
    scored = []
    for issue in q.all():
        vec = load_embedding(issue.embedding)
        if not vec:
            continue
        scored.append((cosine(embedding, vec), issue))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for score, issue in scored[:k]:
        if score < 0.42:
            continue
        out.append(
            {
                "id": issue.id,
                "number": issue.number,
                "title": issue.title,
                "status": issue.status.value,
                "score": round(score, 3),
            }
        )
    return out


def suggest_assignee(db: Session, project_id: int, component_owner_id: int | None) -> User | None:
    if component_owner_id:
        user = db.query(User).filter(User.id == component_owner_id).first()
        if user:
            return user
    # Fastest closer heuristic: most RESOLVED/CLOSED issues in this project
    from sqlalchemy import func
    from app.models import Status

    row = (
        db.query(Issue.assignee_id, func.count(Issue.id).label("n"))
        .filter(
            Issue.project_id == project_id,
            Issue.assignee_id.isnot(None),
            Issue.status.in_([Status.RESOLVED, Status.VERIFIED, Status.CLOSED]),
        )
        .group_by(Issue.assignee_id)
        .order_by(func.count(Issue.id).desc())
        .first()
    )
    if row and row[0]:
        return db.query(User).filter(User.id == row[0]).first()
    return None
