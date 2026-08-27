from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import (
    DependencyType,
    IssueType,
    Priority,
    Resolution,
    Role,
    Severity,
    Status,
)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserOut(ORM):
    id: int
    name: str
    email: str
    role: Role
    avatar: str
    team_id: Optional[int] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: Role = Role.reporter


class ProjectOut(ORM):
    id: int
    team_id: int
    name: str
    key: str
    description: str
    github_repo: str


class ComponentOut(ORM):
    id: int
    project_id: int
    name: str
    default_owner_id: Optional[int] = None


class IssueCreate(BaseModel):
    project_id: int
    title: str = Field(min_length=4, max_length=300)
    description: str = ""
    type: IssueType = IssueType.bug
    severity: Optional[Severity] = None
    priority: Optional[Priority] = None
    component_id: Optional[int] = None
    environment: str = ""
    labels: list[str] = []
    version: str = ""
    assignee_id: Optional[int] = None
    accept_ai: bool = True


class IssueUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[IssueType] = None
    severity: Optional[Severity] = None
    priority: Optional[Priority] = None
    component_id: Optional[int] = None
    environment: Optional[str] = None
    labels: Optional[list[str]] = None
    version: Optional[str] = None
    assignee_id: Optional[int] = None
    cc: Optional[list[int]] = None
    duplicate_of_id: Optional[int] = None


class StatusChange(BaseModel):
    status: Status
    note: str = ""


class IssueOut(ORM):
    id: int
    number: int
    project_id: int
    component_id: Optional[int] = None
    title: str
    description: str
    type: IssueType
    severity: Severity
    priority: Priority
    status: Status
    resolution: Resolution
    reporter_id: int
    assignee_id: Optional[int] = None
    environment: str
    labels: str
    cc: str
    duplicate_of_id: Optional[int] = None
    version: str
    github_pr: str
    ci_status: str
    summary: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    reporter: Optional[UserOut] = None
    assignee: Optional[UserOut] = None
    sla: Optional[dict[str, Any]] = None
    allowed_transitions: list[str] = []
    key: str = ""


class CommentIn(BaseModel):
    body: str = Field(min_length=1)
    is_internal: bool = False
    parent_id: Optional[int] = None


class CommentOut(ORM):
    id: int
    issue_id: int
    author_id: int
    parent_id: Optional[int] = None
    body: str
    body_html: str = ""
    is_internal: bool
    created_at: Optional[datetime] = None
    author: Optional[UserOut] = None


class FilterGroup(BaseModel):
    op: str = "AND"  # AND | OR
    rules: list[dict[str, Any]] = []
    groups: list["FilterGroup"] = []


class SearchIn(BaseModel):
    project_id: Optional[int] = None
    q: str = ""
    group: Optional[FilterGroup] = None
    page: int = 1
    page_size: int = 40
    sort: str = "-updated_at"


class SavedQueryIn(BaseModel):
    name: str
    filter_json: str
    is_shared: bool = False


class DependencyIn(BaseModel):
    depends_on_issue_id: int
    type: DependencyType = DependencyType.blocks


class PresenceEvent(BaseModel):
    issue_id: int
    typing: bool = False
