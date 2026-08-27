from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_rank
from app.database import get_db
from app.models import Comment, Issue, Role, RootCauseInvestigation, User
from app.services.ai import (
    dump_embedding,
    embed_text,
    extractive_summary,
    find_duplicates,
    llm_summary,
    suggest_assignee,
    suggest_priority,
    suggest_severity,
)
from app.services.root_cause import investigation_payload, investigate_issue

router = APIRouter(prefix="/ai", tags=["ai"])


class DraftIn(BaseModel):
    project_id: int
    title: str
    description: str = ""
    component_id: int | None = None


@router.post("/triage")
async def triage(body: DraftIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    text = f"{body.title}\n{body.description}"
    embedding = await embed_text(text)
    sev, conf = suggest_severity(body.title, body.description)
    pri = suggest_priority(sev)
    from app.models import Component

    component = db.query(Component).filter(Component.id == body.component_id).first() if body.component_id else None
    assignee = suggest_assignee(db, body.project_id, component.default_owner_id if component else None)
    return {
        "severity": sev.value,
        "priority": pri.value,
        "confidence": conf,
        "duplicates": find_duplicates(db, body.project_id, embedding),
        "assignee": {"id": assignee.id, "name": assignee.name} if assignee else None,
        "engine": "openai" if __import__("app.config", fromlist=["settings"]).settings.openai_api_key else "local-hash-embed",
    }


@router.post("/issues/{issue_id}/summarize")
async def summarize(issue_id: int, user: User = Depends(require_rank(Role.reporter)), db: Session = Depends(get_db)):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    comments = [
        c.body
        for c in db.query(Comment).filter(Comment.issue_id == issue.id, Comment.is_internal.is_(False)).order_by(Comment.created_at).all()
    ]
    llm = await llm_summary(issue.title, comments)
    summary = llm or extractive_summary(comments, issue.title)
    issue.summary = summary
    db.commit()
    return {"summary": summary, "engine": "llm" if llm else "extractive"}


@router.post("/issues/{issue_id}/reembed")
async def reembed(issue_id: int, user: User = Depends(require_rank(Role.maintainer)), db: Session = Depends(get_db)):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    issue.embedding = dump_embedding(await embed_text(f"{issue.title}\n{issue.description}"))
    db.commit()
    return {"ok": True}


@router.get("/issues/{issue_id}/investigation")
def get_investigation(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.query(Issue).filter(Issue.id == issue_id).first():
        raise HTTPException(404, "Issue not found")
    return investigation_payload(db.query(RootCauseInvestigation).filter_by(issue_id=issue_id).first()) or {"status": "not_started"}


@router.post("/issues/{issue_id}/investigate")
async def start_investigation(issue_id: int, background_tasks: BackgroundTasks, user: User = Depends(require_rank(Role.reporter)), db: Session = Depends(get_db)):
    if not db.query(Issue).filter(Issue.id == issue_id).first():
        raise HTTPException(404, "Issue not found")
    row = db.query(RootCauseInvestigation).filter_by(issue_id=issue_id).first()
    if not row:
        row = RootCauseInvestigation(issue_id=issue_id)
        db.add(row)
    row.status = "queued"
    row.error = ""
    db.commit()
    background_tasks.add_task(investigate_issue, issue_id)
    return investigation_payload(row)
