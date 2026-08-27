from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_rank
from app.database import get_db
from app.models import (
    Attachment,
    Comment,
    Component,
    Dependency,
    Issue,
    NotificationType,
    Project,
    RootCauseInvestigation,
    Role,
    Status,
    StatusHistory,
    User,
    Watch,
)
from app.schemas import (
    CommentIn,
    CommentOut,
    DependencyIn,
    IssueCreate,
    IssueOut,
    IssueUpdate,
    StatusChange,
    UserOut,
)
from app.realtime import broadcast_issue
from app.services.ai import dump_embedding, embed_text, find_duplicates, suggest_assignee, suggest_priority, suggest_severity
from app.services.markdown import render_markdown
from app.services.notify import notify, parse_mentions
from app.services.sla import sla_payload
from app.services.root_cause import investigation_payload, investigate_issue
from app.services.state_machine import allowed_from, can_transition, RESOLUTION_FOR_STATUS

router = APIRouter(tags=["issues"])


def issue_key(project: Project, number: int) -> str:
    return f"{project.key}-{number}"


def serialize_issue(db: Session, issue: Issue) -> dict:
    project = issue.project or db.get(Project, issue.project_id)
    data = IssueOut.model_validate(issue).model_dump()
    data["key"] = issue_key(project, issue.number) if project else str(issue.number)
    data["sla"] = sla_payload(db, issue)
    data["allowed_transitions"] = allowed_from(issue.status)
    data["reporter"] = UserOut.model_validate(issue.reporter) if issue.reporter else None
    data["assignee"] = UserOut.model_validate(issue.assignee) if issue.assignee else None
    data["description_html"] = render_markdown(issue.description or "")
    data["investigation"] = investigation_payload(issue.investigation)
    return data


@router.get("/issues")
def list_issues(
    project_id: int | None = None,
    status: str | None = None,
    severity: str | None = None,
    type: str | None = None,
    assignee_id: int | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Issue).options(
        joinedload(Issue.reporter), joinedload(Issue.assignee), joinedload(Issue.project)
    )
    if project_id:
        query = query.filter(Issue.project_id == project_id)
    if status:
        query = query.filter(Issue.status == Status(status))
    if severity:
        from app.models import Severity
        query = query.filter(Issue.severity == Severity(severity))
    if type:
        from app.models import IssueType
        query = query.filter(Issue.type == IssueType(type))
    if assignee_id:
        query = query.filter(Issue.assignee_id == assignee_id)
    if q:
        like = f"%{q}%"
        query = query.filter((Issue.title.ilike(like)) | (Issue.description.ilike(like)) | (Issue.labels.ilike(like)))
    issues = query.order_by(Issue.updated_at.desc()).limit(400).all()
    return [serialize_issue(db, i) for i in issues]


@router.get("/issues/board")
def board(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    issues = (
        db.query(Issue)
        .options(joinedload(Issue.reporter), joinedload(Issue.assignee), joinedload(Issue.project))
        .filter(Issue.project_id == project_id)
        .all()
    )
    columns = [
        "NEW",
        "TRIAGED",
        "IN_PROGRESS",
        "IN_REVIEW",
        "RESOLVED",
        "VERIFIED",
        "CLOSED",
    ]
    grouped = {c: [] for c in columns}
    grouped["OTHER"] = []
    for i in issues:
        payload = serialize_issue(db, i)
        if i.status.value in grouped:
            grouped[i.status.value].append(payload)
        else:
            grouped["OTHER"].append(payload)
    return grouped


@router.post("/issues")
async def create_issue(body: IssueCreate, background_tasks: BackgroundTasks, user: User = Depends(require_rank(Role.reporter)), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == body.project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    next_num = (db.query(func.max(Issue.number)).filter(Issue.project_id == project.id).scalar() or 0) + 1
    text = f"{body.title}\n{body.description}"
    embedding = await embed_text(text)
    duplicates = find_duplicates(db, project.id, embedding)
    severity = body.severity or suggest_severity(body.title, body.description)[0]
    priority = body.priority or suggest_priority(severity)
    component = db.query(Component).filter(Component.id == body.component_id).first() if body.component_id else None
    assignee_id = body.assignee_id
    if body.accept_ai and not assignee_id:
        suggested = suggest_assignee(db, project.id, component.default_owner_id if component else None)
        if suggested:
            assignee_id = suggested.id
    issue = Issue(
        number=next_num,
        project_id=project.id,
        component_id=body.component_id,
        title=body.title,
        description=body.description,
        type=body.type,
        severity=severity,
        priority=priority,
        status=Status.NEW,
        reporter_id=user.id,
        assignee_id=assignee_id,
        environment=body.environment,
        labels=",".join(body.labels),
        version=body.version,
        embedding=dump_embedding(embedding),
    )
    db.add(issue)
    db.flush()
    db.add(RootCauseInvestigation(issue_id=issue.id, status="queued"))
    db.add(StatusHistory(issue_id=issue.id, from_status="-", to_status=Status.NEW.value, changed_by=user.id, note="created"))
    db.add(Watch(user_id=user.id, issue_id=issue.id))
    if assignee_id:
        notify(db, assignee_id, issue.id, NotificationType.assigned, f"Assigned {project.key}-{next_num}: {issue.title}")
        if assignee_id != user.id:
            db.add(Watch(user_id=assignee_id, issue_id=issue.id))
    db.commit()
    db.refresh(issue)
    payload = serialize_issue(db, issue)
    payload["similar"] = duplicates
    await broadcast_issue(issue.id, "issue_updated", payload)
    background_tasks.add_task(investigate_issue, issue.id)
    return payload


@router.get("/issues/{issue_id}")
def get_issue(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    issue = (
        db.query(Issue)
        .options(joinedload(Issue.reporter), joinedload(Issue.assignee), joinedload(Issue.project))
        .filter(Issue.id == issue_id)
        .first()
    )
    if not issue:
        raise HTTPException(404, "Issue not found")
    payload = serialize_issue(db, issue)
    payload["similar"] = find_duplicates(db, issue.project_id, __import__("json").loads(issue.embedding or "[]") or [0], exclude_id=issue.id)
    return payload


@router.patch("/issues/{issue_id}")
async def update_issue(issue_id: int, body: IssueUpdate, user: User = Depends(require_rank(Role.developer)), db: Session = Depends(get_db)):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    data = body.model_dump(exclude_unset=True)
    if "labels" in data and data["labels"] is not None:
        data["labels"] = ",".join(data["labels"])
    if "cc" in data and data["cc"] is not None:
        data["cc"] = ",".join(str(x) for x in data["cc"])
    old_assignee = issue.assignee_id
    for k, v in data.items():
        setattr(issue, k, v)
    if issue.assignee_id != old_assignee:
        notify(db, issue.assignee_id, issue.id, NotificationType.assigned, f"You were assigned {issue.title}")
    db.commit()
    db.refresh(issue)
    payload = serialize_issue(db, issue)
    await broadcast_issue(issue.id, "issue_updated", payload)
    return payload


@router.post("/issues/{issue_id}/status")
async def change_status(issue_id: int, body: StatusChange, user: User = Depends(require_rank(Role.developer)), db: Session = Depends(get_db)):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    if not can_transition(issue.status, body.status):
        raise HTTPException(409, f"Illegal transition {issue.status.value} → {body.status.value}")
    previous = issue.status
    issue.status = body.status
    issue.resolution = RESOLUTION_FOR_STATUS.get(body.status, issue.resolution)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if body.status in {Status.RESOLVED, Status.VERIFIED, Status.CLOSED, Status.DUPLICATE, Status.WONTFIX}:
        issue.resolved_at = now
    if body.status == Status.REOPENED:
        issue.resolved_at = None
        issue.resolution = RESOLUTION_FOR_STATUS[Status.REOPENED]
    db.add(
        StatusHistory(
            issue_id=issue.id,
            from_status=previous.value,
            to_status=body.status.value,
            changed_by=user.id,
            note=body.note,
        )
    )
    watchers = db.query(Watch).filter(Watch.issue_id == issue.id).all()
    for w in watchers:
        if w.user_id != user.id:
            notify(db, w.user_id, issue.id, NotificationType.status, f"{issue.title}: {previous.value} → {body.status.value}")
    db.commit()
    db.refresh(issue)
    payload = serialize_issue(db, issue)
    await broadcast_issue(issue.id, "issue_updated", payload)
    return payload


@router.get("/issues/{issue_id}/comments")
def list_comments(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from app.auth import can_see_internal

    rows = (
        db.query(Comment)
        .options(joinedload(Comment.author))
        .filter(Comment.issue_id == issue_id)
        .order_by(Comment.created_at.asc())
        .all()
    )
    out = []
    for c in rows:
        if c.is_internal and not can_see_internal(user):
            continue
        item = CommentOut.model_validate(c).model_dump()
        item["body_html"] = render_markdown(c.body)
        item["author"] = UserOut.model_validate(c.author)
        out.append(item)
    return out


@router.post("/issues/{issue_id}/comments")
async def add_comment(issue_id: int, body: CommentIn, user: User = Depends(require_rank(Role.reporter)), db: Session = Depends(get_db)):
    from app.auth import can_see_internal

    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    if body.is_internal and not can_see_internal(user):
        raise HTTPException(403, "Cannot post internal comments")
    comment = Comment(
        issue_id=issue.id,
        author_id=user.id,
        parent_id=body.parent_id,
        body=body.body,
        is_internal=body.is_internal,
    )
    db.add(comment)
    if not issue.first_response_at and user.id != issue.reporter_id:
        issue.first_response_at = datetime.now(timezone.utc).replace(tzinfo=None)
    for handle in parse_mentions(body.body):
        mentioned = db.query(User).filter(User.name.ilike(handle.replace(".", " "))).first()
        if not mentioned:
            mentioned = db.query(User).filter(User.email.ilike(f"{handle}%")).first()
        if mentioned:
            notify(db, mentioned.id, issue.id, NotificationType.mentioned, f"{user.name} mentioned you on {issue.title}")
    for w in db.query(Watch).filter(Watch.issue_id == issue.id).all():
        if w.user_id != user.id:
            notify(db, w.user_id, issue.id, NotificationType.commented, f"New comment on {issue.title}")
    db.commit()
    db.refresh(comment)
    item = CommentOut.model_validate(comment).model_dump()
    item["body_html"] = render_markdown(comment.body)
    item["author"] = UserOut.model_validate(user)
    await broadcast_issue(issue.id, "comment_added", item)
    return item


@router.get("/issues/{issue_id}/history")
def history(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(StatusHistory)
        .options(joinedload(StatusHistory.actor))
        .filter(StatusHistory.issue_id == issue_id)
        .order_by(StatusHistory.changed_at.asc())
        .all()
    )
    return [
        {
            "id": r.id,
            "from_status": r.from_status,
            "to_status": r.to_status,
            "note": r.note,
            "changed_at": r.changed_at,
            "actor": UserOut.model_validate(r.actor) if r.actor else None,
        }
        for r in rows
    ]


@router.post("/issues/{issue_id}/watch")
def watch(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(Watch).filter(Watch.issue_id == issue_id, Watch.user_id == user.id).first()
    if not existing:
        db.add(Watch(issue_id=issue_id, user_id=user.id))
        db.commit()
    return {"watching": True}


@router.delete("/issues/{issue_id}/watch")
def unwatch(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(Watch).filter(Watch.issue_id == issue_id, Watch.user_id == user.id).delete()
    db.commit()
    return {"watching": False}


@router.get("/issues/{issue_id}/watch")
def is_watching(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    w = db.query(Watch).filter(Watch.issue_id == issue_id, Watch.user_id == user.id).first()
    return {"watching": bool(w)}


@router.get("/issues/{issue_id}/dependencies")
def deps(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Dependency).filter((Dependency.issue_id == issue_id) | (Dependency.depends_on_issue_id == issue_id)).all()
    issues = {i.id: i for i in db.query(Issue).all()}
    project_map = {p.id: p.key for p in db.query(Project).all()}
    nodes = {}
    edges = []
    for r in rows:
        for iid in (r.issue_id, r.depends_on_issue_id):
            iss = issues.get(iid)
            if iss:
                nodes[iid] = {
                    "id": iss.id,
                    "key": f"{project_map.get(iss.project_id, 'ISS')}-{iss.number}",
                    "title": iss.title,
                    "status": iss.status.value,
                }
        edges.append({"from": r.issue_id, "to": r.depends_on_issue_id, "type": r.type.value})
    if issue_id not in nodes:
        iss = issues.get(issue_id) or db.get(Issue, issue_id)
        if iss:
            nodes[iss.id] = {
                "id": iss.id,
                "key": f"{project_map.get(iss.project_id, 'ISS')}-{iss.number}",
                "title": iss.title,
                "status": iss.status.value,
            }
    return {"nodes": list(nodes.values()), "edges": edges}


@router.post("/issues/{issue_id}/dependencies")
def add_dep(issue_id: int, body: DependencyIn, user: User = Depends(require_rank(Role.developer)), db: Session = Depends(get_db)):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    if body.depends_on_issue_id == issue_id:
        raise HTTPException(400, "Cannot link an issue to itself")
    target = db.query(Issue).filter(Issue.id == body.depends_on_issue_id).first()
    if not target:
        raise HTTPException(404, f"Target issue #{body.depends_on_issue_id} not found")
    existing = db.query(Dependency).filter(
        Dependency.issue_id == issue_id,
        Dependency.depends_on_issue_id == body.depends_on_issue_id,
        Dependency.type == body.type,
    ).first()
    if existing:
        raise HTTPException(409, "Dependency link already exists")
    db.add(Dependency(issue_id=issue_id, depends_on_issue_id=body.depends_on_issue_id, type=body.type))
    db.commit()
    return deps(issue_id, user, db)


@router.get("/issues/{issue_id}/attachments")
def list_attachments(issue_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Attachment).filter(Attachment.issue_id == issue_id).all()
    return [
        {
            "id": a.id,
            "filename": a.filename,
            "url": a.url,
            "content_type": a.content_type,
            "size": a.size,
            "is_patch": a.is_patch,
        }
        for a in rows
    ]
