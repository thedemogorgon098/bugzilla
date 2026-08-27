from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Notification, User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(80)
        .all()
    )
    unread = sum(1 for r in rows if r.read_at is None)
    return {
        "unread": unread,
        "items": [
            {
                "id": r.id,
                "issue_id": r.issue_id,
                "type": r.type.value,
                "message": r.message,
                "read_at": r.read_at,
                "created_at": r.created_at,
            }
            for r in rows
        ],
    }


@router.post("/read")
def mark_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(Notification).filter(Notification.user_id == user.id, Notification.read_at.is_(None)).update({"read_at": now})
    db.commit()
    return {"ok": True}
