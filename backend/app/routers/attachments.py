import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import require_rank
from app.config import settings
from app.database import get_db
from app.models import Attachment, Issue, Role, User

router = APIRouter(tags=["attachments"])

ALLOWED = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "text/plain",
    "text/x-diff",
    "text/x-patch",
    "application/pdf",
    "application/octet-stream",
}
MAX_BYTES = 8 * 1024 * 1024
PATCH_EXT = {".diff", ".patch"}


@router.post("/issues/{issue_id}/attachments")
async def upload(
    issue_id: int,
    file: UploadFile = File(...),
    user: User = Depends(require_rank(Role.reporter)),
    db: Session = Depends(get_db),
):
    issue = db.query(Issue).filter(Issue.id == issue_id).first()
    if not issue:
        raise HTTPException(404, "Issue not found")
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (8MB max)")
    ctype = file.content_type or "application/octet-stream"
    if ctype not in ALLOWED:
        raise HTTPException(415, "File type not allowed")
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "file.bin").suffix[:8]
    stored = f"{uuid.uuid4().hex}{ext}"
    path = Path(settings.upload_dir) / stored
    path.write_bytes(data)
    att = Attachment(
        issue_id=issue.id,
        uploader_id=user.id,
        filename=file.filename or stored,
        url=f"/uploads/{stored}",
        content_type=ctype,
        size=len(data),
        is_patch=ext.lower() in PATCH_EXT,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return {"id": att.id, "filename": att.filename, "url": att.url, "size": att.size, "is_patch": att.is_patch}


@router.get("/uploads/{name}")
def get_upload(name: str):
    path = Path(settings.upload_dir) / Path(name).name
    if not path.exists():
        raise HTTPException(404, "Not found")
    return FileResponse(path)
