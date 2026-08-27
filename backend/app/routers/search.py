import json
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_rank
from app.database import get_db
from app.models import Issue, Role, SavedQuery, Status, User
from app.routers.issues import serialize_issue
from app.schemas import SavedQueryIn, SearchIn

router = APIRouter(tags=["search"])

OPS = {
    "eq": lambda col, v: col == v,
    "neq": lambda col, v: col != v,
    "contains": lambda col, v: col.ilike(f"%{v}%"),
    "in": lambda col, v: col.in_(v if isinstance(v, list) else [v]),
}


def field_col(field: str):
    mapping = {
        "status": Issue.status,
        "severity": Issue.severity,
        "priority": Issue.priority,
        "type": Issue.type,
        "assignee_id": Issue.assignee_id,
        "reporter_id": Issue.reporter_id,
        "component_id": Issue.component_id,
        "project_id": Issue.project_id,
        "title": Issue.title,
        "environment": Issue.environment,
        "labels": Issue.labels,
        "version": Issue.version,
    }
    return mapping.get(field)


def apply_group(query, group: dict[str, Any]):
    from sqlalchemy import and_, or_

    clauses = []
    for rule in group.get("rules") or []:
        col = field_col(rule.get("field", ""))
        if col is None:
            continue
        op = OPS.get(rule.get("op", "eq"))
        if not op:
            continue
        clauses.append(op(col, rule.get("value")))
    for child in group.get("groups") or []:
        sub = apply_group_expr(child)
        if sub is not None:
            clauses.append(sub)
    if not clauses:
        return query
    combiner = or_ if (group.get("op") or "AND").upper() == "OR" else and_
    return query.filter(combiner(*clauses))


def apply_group_expr(group: dict[str, Any]):
    from sqlalchemy import and_, or_

    clauses = []
    for rule in group.get("rules") or []:
        col = field_col(rule.get("field", ""))
        if col is None:
            continue
        op = OPS.get(rule.get("op", "eq"))
        if not op:
            continue
        clauses.append(op(col, rule.get("value")))
    for child in group.get("groups") or []:
        sub = apply_group_expr(child)
        if sub is not None:
            clauses.append(sub)
    if not clauses:
        return None
    combiner = or_ if (group.get("op") or "AND").upper() == "OR" else and_
    return combiner(*clauses)


@router.post("/search")
def search(body: SearchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(Issue).options(
        joinedload(Issue.reporter), joinedload(Issue.assignee), joinedload(Issue.project)
    )
    if body.project_id:
        query = query.filter(Issue.project_id == body.project_id)
    if body.q:
        like = f"%{body.q}%"
        query = query.filter((Issue.title.ilike(like)) | (Issue.description.ilike(like)) | (Issue.labels.ilike(like)))
    if body.group:
        query = apply_group(query, body.group.model_dump())
    total = query.count()
    sort = body.sort or "-updated_at"
    desc = sort.startswith("-")
    field = sort.lstrip("-")
    col = getattr(Issue, field, Issue.updated_at)
    query = query.order_by(col.desc() if desc else col.asc())
    page = max(body.page, 1)
    size = min(max(body.page_size, 1), 100)
    rows = query.offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "page_size": size, "items": [serialize_issue(db, i) for i in rows]}


@router.get("/saved-queries")
def list_saved(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(SavedQuery)
        .filter((SavedQuery.user_id == user.id) | (SavedQuery.is_shared.is_(True)))
        .order_by(SavedQuery.created_at.desc())
        .all()
    )
    return [
        {"id": r.id, "name": r.name, "filter_json": r.filter_json, "is_shared": r.is_shared, "user_id": r.user_id}
        for r in rows
    ]


@router.post("/saved-queries")
def create_saved(body: SavedQueryIn, user: User = Depends(require_rank(Role.reporter)), db: Session = Depends(get_db)):
    row = SavedQuery(user_id=user.id, name=body.name, filter_json=body.filter_json, is_shared=body.is_shared)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "filter_json": row.filter_json, "is_shared": row.is_shared}
