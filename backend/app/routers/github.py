import hashlib
import hmac
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_rank
from app.config import settings
from app.database import get_db
from app.models import Issue, NotificationType, Project, Role, Status, StatusHistory, User
from app.services.notify import notify
from app.services.state_machine import can_transition

router = APIRouter(prefix="/integrations/github", tags=["github"])

FIXES_RE = re.compile(r"(?:fixes|closes|resolves)\s+#(\d+)", re.I)
REF_RE = re.compile(r"(?:refs|references)\s+#(\d+)", re.I)


def verify_sig(body: bytes, signature: str | None) -> bool:
    if not settings.github_webhook_secret:
        return True
    if not signature or not signature.startswith("sha256="):
        return False
    digest = hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={digest}", signature)


@router.post("/webhook")
async def github_webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_hub_signature_256: str | None = Header(default=None),
    x_github_event: str | None = Header(default=None),
):
    raw = await request.body()
    if not verify_sig(raw, x_hub_signature_256):
        raise HTTPException(401, "Invalid GitHub signature")
    payload = json.loads(raw or b"{}")
    event = x_github_event or ""
    repo = (payload.get("repository") or {}).get("full_name") or ""
    project = db.query(Project).filter(Project.github_repo == repo).first() if repo else db.query(Project).first()
    if not project:
        return {"ok": True, "ignored": "no project"}

    system = db.query(User).filter(User.email == "bot@nexustrack.dev").first()
    actor_id = system.id if system else 1

    if event == "pull_request":
        pr = payload.get("pull_request") or {}
        action = payload.get("action")
        title = pr.get("title") or ""
        body = pr.get("body") or ""
        html = pr.get("html_url") or ""
        numbers = [int(n) for n in FIXES_RE.findall(title + " " + body) + REF_RE.findall(title + " " + body)]
        for num in numbers:
            issue = db.query(Issue).filter(Issue.project_id == project.id, Issue.number == num).first()
            if not issue:
                continue
            issue.github_pr = html
            target = None
            if action in {"opened", "ready_for_review", "synchronize"}:
                target = Status.IN_REVIEW
                issue.ci_status = issue.ci_status or "pending"
            if action == "closed" and pr.get("merged"):
                target = Status.RESOLVED
            if target and can_transition(issue.status, target):
                prev = issue.status
                issue.status = target
                if target == Status.RESOLVED:
                    issue.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
                db.add(
                    StatusHistory(
                        issue_id=issue.id,
                        from_status=prev.value,
                        to_status=target.value,
                        changed_by=actor_id,
                        note=f"GitHub PR {action}: {html}",
                    )
                )
                notify(db, issue.assignee_id, issue.id, NotificationType.github, f"PR {action} linked to issue: {html}")
        db.commit()
        return {"ok": True, "linked": numbers}

    if event == "check_suite" or event == "check_run" or event == "status":
        conclusion = (
            (payload.get("check_suite") or {}).get("conclusion")
            or (payload.get("check_run") or {}).get("conclusion")
            or payload.get("state")
        )
        sha_msg = (
            ((payload.get("check_suite") or {}).get("head_commit") or {}).get("message")
            or payload.get("description")
            or ""
        )
        numbers = [int(n) for n in FIXES_RE.findall(sha_msg) + REF_RE.findall(sha_msg)]
        for num in numbers:
            issue = db.query(Issue).filter(Issue.project_id == project.id, Issue.number == num).first()
            if issue:
                issue.ci_status = conclusion or "pending"
        db.commit()
        return {"ok": True, "ci": conclusion}

    if event == "push":
        for commit in payload.get("commits") or []:
            msg = commit.get("message") or ""
            url = commit.get("url") or ""
            for num in [int(n) for n in FIXES_RE.findall(msg)]:
                issue = db.query(Issue).filter(Issue.project_id == project.id, Issue.number == num).first()
                if issue:
                    issue.github_pr = issue.github_pr or url
                    notify(db, issue.assignee_id, issue.id, NotificationType.github, f"Commit referenced this issue: {url}")
        db.commit()
        return {"ok": True}

    return {"ok": True, "event": event}


@router.post("/demo-merge/{issue_id}")
def demo_merge(issue_id: int, user: User = Depends(require_rank(Role.developer)), db: Session = Depends(get_db)):
    """Hackathon demo: pretend a GitHub PR with `Fixes #N` just merged."""
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    system = db.query(User).filter(User.email == "bot@nexustrack.dev").first()
    actor_id = system.id if system else user.id
    issue.github_pr = issue.github_pr or f"https://github.com/nexustrack/core/pull/{issue.number + 40}"
    issue.ci_status = "success"
    target = Status.RESOLVED
    if can_transition(issue.status, target):
        prev = issue.status
        issue.status = target
        issue.resolved_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(
            StatusHistory(
                issue_id=issue.id,
                from_status=prev.value,
                to_status=target.value,
                changed_by=actor_id,
                note=f"GitHub PR merged: {issue.github_pr} (Fixes #{issue.number})",
            )
        )
        notify(db, issue.assignee_id, issue.id, NotificationType.github, f"PR merged and resolved this issue: {issue.github_pr}")
    db.commit()
    from app.routers.issues import serialize_issue

    return serialize_issue(db, issue)
