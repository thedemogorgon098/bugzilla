"""Asynchronous root-cause investigation orchestration."""

from __future__ import annotations

import json
from datetime import datetime

import httpx
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import SessionLocal
from app.models import Issue, RootCauseInvestigation, User
from app.realtime import broadcast_issue
from app.services.ai import find_duplicates, load_embedding, suggest_assignee


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


async def _github_commits(repo: str, issue: Issue) -> list[dict]:
    if not repo or not settings.github_token:
        return []
    try:
        headers = {"Accept": "application/vnd.github+json", "Authorization": f"Bearer {settings.github_token}"}
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"https://api.github.com/repos/{repo}/commits", params={"per_page": 20}, headers=headers)
            response.raise_for_status()
        return [{
            "sha": item.get("sha", "")[:12],
            "message": ((item.get("commit") or {}).get("message") or "").splitlines()[0],
            "author": ((item.get("commit") or {}).get("author") or {}).get("name", "unknown"),
            "date": ((item.get("commit") or {}).get("author") or {}).get("date"),
            "url": item.get("html_url", ""),
            "files": [],
        } for item in response.json()]
    except Exception:
        return []


def _local_commits(issue: Issue) -> list[dict]:
    if not issue.github_pr:
        return []
    return [{"sha": "linked-pr", "message": f"Change linked from {issue.github_pr}", "author": "GitHub",
             "date": _iso(issue.updated_at), "url": issue.github_pr, "files": []}]


def _report(issue: Issue, commits: list[dict], similar: list[dict], owner: User | None) -> dict:
    component = issue.component.name if issue.component else "Unclassified"
    likely = commits[0] if commits else None
    return {
        "likely_commit": likely,
        "likely_deployment": {"id": "deploy-current", "environment": issue.environment or "production", "status": "observed", "at": _iso(issue.created_at)},
        "component": component,
        "confidence": round(0.86 if likely else (0.58 if similar else 0.31), 2),
        "reasoning": (f"The report is scoped to {component}. The strongest available change signal is {likely['message']}." if likely else
                      f"No linked commit is available yet. The finding uses {len(similar)} semantically similar historical bug(s) and component ownership."),
        "affected_modules": [component],
        "suggested_owner": {"id": owner.id, "name": owner.name, "avatar": owner.avatar} if owner else None,
        "similar_bugs": similar,
        "sequence": [
            {"label": "Commit", "at": likely.get("date") if likely else None, "detail": likely.get("message") if likely else "No linked commit"},
            {"label": "Deployment", "at": _iso(issue.created_at), "detail": issue.environment or "production"},
            {"label": "Error Spike", "at": _iso(issue.created_at), "detail": "Inferred from bug report"},
            {"label": "Bug Report", "at": _iso(issue.created_at), "detail": issue.title},
        ],
    }


async def investigate_issue(issue_id: int) -> None:
    db = SessionLocal()
    investigation = None
    try:
        investigation = db.query(RootCauseInvestigation).filter_by(issue_id=issue_id).first()
        issue = db.query(Issue).options(joinedload(Issue.project), joinedload(Issue.component)).filter_by(id=issue_id).first()
        if not issue or not investigation:
            return
        investigation.status = "running"
        db.commit()
        commits = await _github_commits(issue.project.github_repo, issue) or _local_commits(issue)
        similar = find_duplicates(db, issue.project_id, load_embedding(issue.embedding) or [0], exclude_id=issue.id)
        owner = suggest_assignee(db, issue.project_id, issue.component.default_owner_id if issue.component else None)
        evidence = {"bug": {"id": issue.id, "title": issue.title, "description": issue.description, "created_at": _iso(issue.created_at)},
                    "commits": commits, "deployments": [{"environment": issue.environment or "production", "at": _iso(issue.created_at), "status": "observed"}],
                    "historical_resolutions": similar}
        investigation.report_json = json.dumps(_report(issue, commits, similar, owner))
        investigation.evidence_json = json.dumps(evidence)
        investigation.provider = "github+local-semantic"
        investigation.status = "completed"
        investigation.error = ""
        db.commit()
        await broadcast_issue(issue.id, "investigation_updated", {"id": issue.id, "investigation": investigation_payload(investigation)})
    except Exception as exc:
        db.rollback()
        if investigation:
            investigation.status = "failed"
            investigation.error = str(exc)[:500]
            db.commit()
    finally:
        db.close()


def investigation_payload(row: RootCauseInvestigation | None) -> dict | None:
    if not row:
        return None
    return {"id": row.id, "status": row.status, "provider": row.provider, "error": row.error,
            "report": json.loads(row.report_json or "{}"), "evidence": json.loads(row.evidence_json or "{}"),
            "created_at": _iso(row.created_at), "updated_at": _iso(row.updated_at)}