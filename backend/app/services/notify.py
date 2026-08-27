from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Notification, NotificationType


def notify(db: Session, user_id: int | None, issue_id: int | None, ntype: NotificationType, message: str):
    if not user_id:
        return
    db.add(
        Notification(
            user_id=user_id,
            issue_id=issue_id,
            type=ntype,
            message=message,
        )
    )


def parse_mentions(body: str) -> list[str]:
    import re

    return re.findall(r"@([A-Za-z0-9._-]+)", body or "")
