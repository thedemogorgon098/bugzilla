from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Role(str, enum.Enum):
    admin = "admin"
    maintainer = "maintainer"
    developer = "developer"
    reporter = "reporter"
    guest = "guest"


class IssueType(str, enum.Enum):
    bug = "bug"
    feature = "feature"
    task = "task"


class Severity(str, enum.Enum):
    blocker = "blocker"
    critical = "critical"
    major = "major"
    minor = "minor"
    trivial = "trivial"


class Priority(str, enum.Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class Status(str, enum.Enum):
    NEW = "NEW"
    TRIAGED = "TRIAGED"
    IN_PROGRESS = "IN_PROGRESS"
    IN_REVIEW = "IN_REVIEW"
    RESOLVED = "RESOLVED"
    VERIFIED = "VERIFIED"
    CLOSED = "CLOSED"
    REOPENED = "REOPENED"
    DUPLICATE = "DUPLICATE"
    WONTFIX = "WONTFIX"
    CANNOT_REPRODUCE = "CANNOT_REPRODUCE"


class Resolution(str, enum.Enum):
    none = "none"
    fixed = "fixed"
    duplicate = "duplicate"
    wontfix = "wontfix"
    cannot_reproduce = "cannot_reproduce"
    worksforme = "worksforme"
    invalid = "invalid"


class DependencyType(str, enum.Enum):
    blocks = "blocks"
    related = "related"
    duplicates = "duplicates"


class NotificationType(str, enum.Enum):
    assigned = "assigned"
    mentioned = "mentioned"
    commented = "commented"
    status = "status"
    sla = "sla"
    github = "github"
    duplicate = "duplicate"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.reporter)
    avatar: Mapped[str] = mapped_column(String(16), default="NT")
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    team: Mapped["Team | None"] = relationship(back_populates="members")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    key: Mapped[str] = mapped_column(String(12), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")

    members: Mapped[list[User]] = relationship(back_populates="team")
    projects: Mapped[list["Project"]] = relationship(back_populates="team")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    name: Mapped[str] = mapped_column(String(120))
    key: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    github_repo: Mapped[str] = mapped_column(String(255), default="")

    team: Mapped[Team] = relationship(back_populates="projects")
    components: Mapped[list["Component"]] = relationship(back_populates="project")
    issues: Mapped[list["Issue"]] = relationship(back_populates="project")
    slas: Mapped[list["SLA"]] = relationship(back_populates="project")


class Component(Base):
    __tablename__ = "components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    default_owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    project: Mapped[Project] = relationship(back_populates="components")
    default_owner: Mapped[User | None] = relationship()


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[int] = mapped_column(Integer, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    component_id: Mapped[int | None] = mapped_column(ForeignKey("components.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(300), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[IssueType] = mapped_column(Enum(IssueType), default=IssueType.bug)
    severity: Mapped[Severity] = mapped_column(Enum(Severity), default=Severity.major)
    priority: Mapped[Priority] = mapped_column(Enum(Priority), default=Priority.P2)
    status: Mapped[Status] = mapped_column(Enum(Status), default=Status.NEW, index=True)
    resolution: Mapped[Resolution] = mapped_column(Enum(Resolution), default=Resolution.none)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    environment: Mapped[str] = mapped_column(String(255), default="")
    labels: Mapped[str] = mapped_column(String(500), default="")  # comma-separated
    cc: Mapped[str] = mapped_column(String(500), default="")  # comma-separated user ids
    duplicate_of_id: Mapped[int | None] = mapped_column(ForeignKey("issues.id"), nullable=True)
    embedding: Mapped[str] = mapped_column(Text, default="")  # JSON float array
    version: Mapped[str] = mapped_column(String(64), default="")
    github_pr: Mapped[str] = mapped_column(String(255), default="")
    ci_status: Mapped[str] = mapped_column(String(32), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    project: Mapped[Project] = relationship(back_populates="issues")
    component: Mapped[Component | None] = relationship()
    reporter: Mapped[User] = relationship(foreign_keys=[reporter_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    comments: Mapped[list["Comment"]] = relationship(back_populates="issue")
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="issue")
    history: Mapped[list["StatusHistory"]] = relationship(back_populates="issue")
    investigation: Mapped["RootCauseInvestigation | None"] = relationship(back_populates="issue", uselist=False)


class RootCauseInvestigation(Base):
    __tablename__ = "root_cause_investigations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    report_json: Mapped[str] = mapped_column(Text, default="{}")
    evidence_json: Mapped[str] = mapped_column(Text, default="{}")
    provider: Mapped[str] = mapped_column(String(32), default="local")
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    issue: Mapped[Issue] = relationship(back_populates="investigation")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    issue: Mapped[Issue] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    is_patch: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    issue: Mapped[Issue] = relationship(back_populates="attachments")
    uploader: Mapped[User] = relationship()


class StatusHistory(Base):
    __tablename__ = "status_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)
    from_status: Mapped[str] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32))
    changed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(String(500), default="")
    changed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    issue: Mapped[Issue] = relationship(back_populates="history")
    actor: Mapped[User] = relationship()


class Watch(Base):
    __tablename__ = "watches"
    __table_args__ = (UniqueConstraint("user_id", "issue_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)


class Dependency(Base):
    __tablename__ = "dependencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)
    depends_on_issue_id: Mapped[int] = mapped_column(ForeignKey("issues.id"), index=True)
    type: Mapped[DependencyType] = mapped_column(Enum(DependencyType), default=DependencyType.blocks)


class SavedQuery(Base):
    __tablename__ = "saved_queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    filter_json: Mapped[str] = mapped_column(Text)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    issue_id: Mapped[int | None] = mapped_column(ForeignKey("issues.id"), nullable=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType))
    message: Mapped[str] = mapped_column(String(500))
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class SLA(Base):
    __tablename__ = "slas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    severity: Mapped[Severity] = mapped_column(Enum(Severity))
    response_hours: Mapped[float] = mapped_column(Float, default=8)
    resolution_hours: Mapped[float] = mapped_column(Float, default=72)

    project: Mapped[Project] = relationship(back_populates="slas")


class Webhook(Base):
    __tablename__ = "webhooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"))
    url: Mapped[str] = mapped_column(String(500))
    kind: Mapped[str] = mapped_column(String(32), default="slack")
    secret: Mapped[str] = mapped_column(String(255), default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
