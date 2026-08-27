from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_rank
from app.database import get_db
from app.models import Component, Dependency, Issue, Project, Role, User
from app.schemas import ComponentOut, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
def list_projects(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.key).all()


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Project).filter(Project.id == project_id).first()


@router.get("/{project_id}/components", response_model=list[ComponentOut])
def list_components(project_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Component).filter(Component.project_id == project_id).all()


@router.get("/users/all")
def list_users(_: User = Depends(require_rank(Role.guest)), db: Session = Depends(get_db)):
    from app.schemas import UserOut

    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.name).all()]


@router.get("/{project_id}/graph")
def project_graph(project_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    issues = db.query(Issue).filter(Issue.project_id == project_id).all()
    ids = [i.id for i in issues]
    deps = []
    if ids:
        deps = (
            db.query(Dependency)
            .filter((Dependency.issue_id.in_(ids)) | (Dependency.depends_on_issue_id.in_(ids)))
            .all()
        )
    key = project.key if project else "ISS"
    return {
        "nodes": [
            {
                "id": i.id,
                "key": f"{key}-{i.number}",
                "title": i.title,
                "status": i.status.value,
                "severity": i.severity.value,
            }
            for i in issues
        ],
        "edges": [{"from": d.issue_id, "to": d.depends_on_issue_id, "type": d.type.value} for d in deps],
    }
