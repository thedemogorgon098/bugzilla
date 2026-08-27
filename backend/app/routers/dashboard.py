from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Issue, Status, User
from app.routers.issues import serialize_issue
from app.services.sla import sla_payload

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

OPEN = {Status.NEW, Status.TRIAGED, Status.IN_PROGRESS, Status.IN_REVIEW, Status.REOPENED}


@router.get("")
def dashboard(project_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = db.query(Issue)
    if project_id:
        q = q.filter(Issue.project_id == project_id)
    issues = q.all()
    by_status: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    mttr_sum = 0.0
    mttr_n = 0
    stale = []
    mine = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for i in issues:
        by_status[i.status.value] = by_status.get(i.status.value, 0) + 1
        by_severity[i.severity.value] = by_severity.get(i.severity.value, 0) + 1
        by_priority[i.priority.value] = by_priority.get(i.priority.value, 0) + 1
        if i.resolved_at and i.created_at:
            mttr_sum += (i.resolved_at - i.created_at).total_seconds() / 3600
            mttr_n += 1
        sla = sla_payload(db, i)
        if sla["breached"] and i.status in OPEN:
            stale.append(serialize_issue(db, i))
        if i.assignee_id == user.id and i.status in OPEN:
            mine.append(serialize_issue(db, i))

    # Open vs closed trend (last 14 days)
    trend = []
    for d in range(13, -1, -1):
        day = (now - timedelta(days=d)).date()
        opened = sum(1 for i in issues if i.created_at and i.created_at.date() == day)
        closed = sum(
            1
            for i in issues
            if i.resolved_at and i.resolved_at.date() == day
        )
        trend.append({"date": day.isoformat(), "opened": opened, "closed": closed})

    cfd = []
    for d in range(13, -1, -1):
        day = (now - timedelta(days=d)).date()
        bucket = {"date": day.isoformat()}
        for st in Status:
            bucket[st.value] = sum(
                1
                for i in issues
                if i.created_at and i.created_at.date() <= day and (not i.resolved_at or i.resolved_at.date() > day or i.status == st)
            )
        cfd.append(bucket)

    # Workload distribution across assignees for open issues
    assignee_counts: dict[int, int] = {}
    for i in issues:
        if i.status in OPEN and i.assignee_id:
            assignee_counts[i.assignee_id] = assignee_counts.get(i.assignee_id, 0) + 1
    
    all_users = {u.id: u for u in db.query(User).all()}
    workload = [
        {
            "id": uid,
            "name": all_users[uid].name if uid in all_users else f"User #{uid}",
            "avatar": all_users[uid].avatar if uid in all_users else "?",
            "role": all_users[uid].role.value if uid in all_users else "developer",
            "count": count,
        }
        for uid, count in sorted(assignee_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    total_count = len(issues)
    closed_count = sum(1 for i in issues if i.status not in OPEN)
    open_count = sum(1 for i in issues if i.status in OPEN)
    res_rate = round((closed_count / total_count) * 100, 1) if total_count > 0 else 0.0

    # Leaderboard by reporters
    reporters = (
        db.query(Issue.reporter_id, func.count(Issue.id))
        .group_by(Issue.reporter_id)
        .order_by(func.count(Issue.id).desc())
        .limit(8)
        .all()
    )
    leaderboard = [{"name": all_users[uid].name if uid in all_users else str(uid), "count": n} for uid, n in reporters]

    # Recent issues
    recent_issues = sorted(issues, key=lambda x: x.updated_at or x.created_at or datetime.min, reverse=True)[:8]

    return {
        "totals": {
            "issues": total_count,
            "open": open_count,
            "closed": closed_count,
            "resolution_rate": res_rate,
        },
        "by_status": by_status,
        "by_severity": by_severity,
        "by_priority": by_priority,
        "mttr_hours": round(mttr_sum / mttr_n, 2) if mttr_n else 0,
        "trend": trend,
        "cfd": cfd,
        "leaderboard": leaderboard,
        "workload": workload,
        "recent": [serialize_issue(db, i) for i in recent_issues],
        "stale": stale[:12],
        "mine": mine[:20],
        "velocity": round(sum(p["closed"] for p in trend[-7:]) / 7, 2),
    }


@router.get("/export.csv")
def export_csv(project_id: int | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from fastapi.responses import PlainTextResponse

    q = db.query(Issue)
    if project_id:
        q = q.filter(Issue.project_id == project_id)
    lines = ["id,number,title,status,severity,priority,assignee,hours_open,sla_breached,created_at"]
    for i in q.all():
        title = i.title.replace('"', "'")
        sla = sla_payload(db, i)
        lines.append(
            f'{i.id},{i.number},"{title}",{i.status.value},{i.severity.value},{i.priority.value},{i.assignee_id or ""},{sla["hours_open"]},{sla["breached"]},{i.created_at}'
        )
    return PlainTextResponse(
        "\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nexustrack-issues.csv"},
    )
