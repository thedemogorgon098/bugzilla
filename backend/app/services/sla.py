from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Issue, SLA, Severity, Status


TERMINAL = {Status.RESOLVED, Status.VERIFIED, Status.CLOSED, Status.DUPLICATE, Status.WONTFIX, Status.CANNOT_REPRODUCE}


def sla_for(db: Session, issue: Issue) -> SLA | None:
    return (
        db.query(SLA)
        .filter(SLA.project_id == issue.project_id, SLA.severity == issue.severity)
        .first()
    )


def sla_payload(db: Session, issue: Issue) -> dict:
    sla = sla_for(db, issue)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    created = issue.created_at or now
    hours_open = max((now - created).total_seconds() / 3600, 0)
    response_hours = sla.response_hours if sla else 8.0
    resolution_hours = sla.resolution_hours if sla else 72.0
    responded = issue.first_response_at is not None or issue.status not in {Status.NEW}
    resolved = issue.status in TERMINAL
    response_breach = (not responded) and hours_open > response_hours
    resolution_breach = (not resolved) and hours_open > resolution_hours
    return {
        "response_hours": response_hours,
        "resolution_hours": resolution_hours,
        "hours_open": round(hours_open, 2),
        "responded": responded,
        "resolved": resolved,
        "response_breach": response_breach,
        "resolution_breach": resolution_breach,
        "breached": response_breach or resolution_breach,
        "countdown_hours": round(max(resolution_hours - hours_open, 0), 2),
    }
