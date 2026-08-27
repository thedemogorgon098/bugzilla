"""Seed a realistic Mozilla-adjacent demo project so the live demo is not empty."""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import (
    Comment,
    Component,
    Dependency,
    DependencyType,
    Issue,
    IssueType,
    Notification,
    NotificationType,
    Priority,
    Project,
    Resolution,
    Role,
    SavedQuery,
    Severity,
    SLA,
    Status,
    StatusHistory,
    Team,
    User,
    Watch,
    Webhook,
)
from app.services.ai import dump_embedding, hash_embed


USERS = [
    ("Maya Chen", "maya@nexustrack.dev", Role.admin, "MC"),
    ("Jamal Ortiz", "jamal@nexustrack.dev", Role.maintainer, "JO"),
    ("Priya Nair", "priya@nexustrack.dev", Role.developer, "PN"),
    ("Leo Andersson", "leo@nexustrack.dev", Role.developer, "LA"),
    ("Sofia Rossi", "sofia@nexustrack.dev", Role.reporter, "SR"),
    ("Nexus Bot", "bot@nexustrack.dev", Role.maintainer, "NB"),
]

PASSWORD = "demo1234"


SEED_ISSUES = [
    dict(
        title="Login form submits twice and creates duplicate sessions",
        description="## Repro\n1. Open /login\n2. Double-click Sign in\n3. Two session cookies are set.\n\n**Expected:** debounce submit.\n**Env:** Firefox 128 / Windows 11.",
        type=IssueType.bug,
        severity=Severity.major,
        status=Status.IN_PROGRESS,
        labels="auth,regression",
        component="Auth",
        env="prod-eu",
    ),
    dict(
        title="Double-clicking Sign in creates two JWT sessions",
        description="Users report two live sessions after impatient clicks on the login button. Related to race in /auth/login.",
        type=IssueType.bug,
        severity=Severity.major,
        status=Status.NEW,
        labels="auth,duplicate-candidate",
        component="Auth",
        env="prod-us",
    ),
    dict(
        title="Crash on empty stack trace paste in new issue form",
        description="Pasting an empty ``` block into the markdown editor throws `TypeError: Cannot read properties of undefined (reading 'length')`. Data loss if the form is mid-flight.",
        type=IssueType.bug,
        severity=Severity.critical,
        status=Status.TRIAGED,
        labels="editor,crash",
        component="Issue Composer",
        env="staging",
    ),
    dict(
        title="Kanban drag to CLOSED skips VERIFIED and bypasses QA",
        description="Illegal transition NEW → CLOSED is blocked in API but the board optimistic UI still moves the card until refresh. Need client+server agreement.",
        type=IssueType.bug,
        severity=Severity.blocker,
        status=Status.IN_REVIEW,
        labels="board,statemachine",
        component="Board",
        env="all",
        github_pr="https://github.com/nexustrack/core/pull/88",
        ci="success",
    ),
    dict(
        title="Private comments leak in search API for guest role",
        description="`POST /search` was joining comments without filtering is_internal. Guests could see maintainer notes in snippet highlights. **Security.**",
        type=IssueType.bug,
        severity=Severity.blocker,
        status=Status.RESOLVED,
        labels="security,rbac",
        component="Search",
        env="prod",
        resolution=Resolution.fixed,
    ),
    dict(
        title="Semantic duplicate detector misses paraphrases",
        description="Hash embeddings underweight word order. 'sessions created twice' vs 'duplicate sessions on login' scores 0.39. Need better tokenization / optional OpenAI embeddings.",
        type=IssueType.task,
        severity=Severity.minor,
        status=Status.TRIAGED,
        labels="ai,ml",
        component="Triage",
        env="ml-lab",
    ),
    dict(
        title="SLA badge timezone is UTC-only, Indian teams see false breaches",
        description="Countdown uses naive UTC. For IST reporters, response SLA fires 5.5h early on the dashboard widget.",
        type=IssueType.bug,
        severity=Severity.major,
        status=Status.NEW,
        labels="sla,i18n",
        component="Dashboards",
        env="prod-in",
    ),
    dict(
        title="GitHub Fixes #N does not transition when PR is squash-merged",
        description="Webhook handler reads `merged` on pull_request closed, but squash merge payload sometimes omits body. Parse commit message from `head_commit` as fallback.",
        type=IssueType.bug,
        severity=Severity.critical,
        status=Status.IN_PROGRESS,
        labels="github,webhooks",
        component="Integrations",
        env="prod",
        github_pr="https://github.com/nexustrack/core/pull/102",
        ci="pending",
    ),
    dict(
        title="Dark mode contrast on severity pills fails WCAG AA",
        description="Critical red on zinc-950 is 3.8:1. Need token update for --sev-critical.",
        type=IssueType.bug,
        severity=Severity.trivial,
        status=Status.VERIFIED,
        labels="a11y,ui",
        component="Design System",
        env="all",
        resolution=Resolution.fixed,
    ),
    dict(
        title="Export CSV does not include SLA breach column",
        description="Stakeholders asked for breached,hours_open in /dashboard/export.csv.",
        type=IssueType.feature,
        severity=Severity.minor,
        status=Status.TRIAGED,
        labels="reporting",
        component="Dashboards",
        env="n/a",
    ),
    dict(
        title="Cannot reproduce: websocket presence flicker on Safari 17",
        description="Viewers count oscillates 1↔2. Maybe duplicate connect from bfcache.",
        type=IssueType.bug,
        severity=Severity.minor,
        status=Status.CANNOT_REPRODUCE,
        labels="realtime,safari",
        component="Realtime",
        env="safari",
        resolution=Resolution.cannot_reproduce,
    ),
    dict(
        title="Command palette should jump to saved queries",
        description="Cmd+K currently searches issues only. Add a Queries group.",
        type=IssueType.feature,
        severity=Severity.trivial,
        status=Status.NEW,
        labels="ux,power-user",
        component="Shell",
        env="all",
    ),
    dict(
        title="Attachment upload allows SVG with script",
        description="Need to reject image/svg+xml even if browser sends octet-stream. Signed URLs later.",
        type=IssueType.bug,
        severity=Severity.critical,
        status=Status.WONTFIX,
        labels="security,uploads",
        component="Attachments",
        env="prod",
        resolution=Resolution.wontfix,
    ),
    dict(
        title="Mean time to resolution widget ignores reopened issues",
        description="MTTR should be last resolved_at - created_at, excluding reopen churn or measuring each cycle.",
        type=IssueType.bug,
        severity=Severity.major,
        status=Status.CLOSED,
        labels="analytics",
        component="Dashboards",
        env="prod",
        resolution=Resolution.fixed,
    ),
    dict(
        title="Add cumulative flow diagram to project dashboard",
        description="CFD is the missing Bugzilla report replacement. Stacked area by status over 14 days.",
        type=IssueType.feature,
        severity=Severity.minor,
        status=Status.IN_REVIEW,
        labels="analytics,charts",
        component="Dashboards",
        env="n/a",
        github_pr="https://github.com/nexustrack/core/pull/77",
        ci="failure",
    ),
]


COMMENTS = {
    1: [
        (2, "Confirmed on staging. Race is in `submitLock` ref not surviving Strict Mode.", False),
        (3, "I'll debounce at the form layer and add a unique request id.", False),
        (2, "@priya also add a 409 on the server if the previous login is <800ms old.", True),
    ],
    5: [
        (1, "Patched query layer. Guests no longer join comment bodies.", False),
        (4, "Verified with guest token in CI. Shipping.", False),
    ],
    8: [
        (6, "Webhook received pull_request.closed merged=true but body empty after squash.", False),
        (3, "Working on head_commit fallback. Fixes #8 is in the squash subject.", False),
    ],
}


def seed(db: Session) -> None:
    if db.query(User).first():
        return

    users: list[User] = []
    for name, email, role, avatar in USERS:
        u = User(name=name, email=email, hashed_password=hash_password(PASSWORD), role=role, avatar=avatar)
        db.add(u)
        users.append(u)
    db.flush()
    maya, jamal, priya, leo, sofia, bot = users

    team = Team(name="Nexus Platform", key="NX", description="Core issue tracking platform")
    db.add(team)
    db.flush()
    for u in users:
        u.team_id = team.id

    project = Project(
        team_id=team.id,
        name="NexusTrack Core",
        key="NT",
        description="Reimagining Bugzilla — structured lifecycle, AI triage, git-native workflow.",
        github_repo="nexustrack/core",
    )
    db.add(project)
    db.flush()

    comps = {}
    owners = {
        "Auth": priya.id,
        "Issue Composer": leo.id,
        "Board": jamal.id,
        "Search": priya.id,
        "Triage": maya.id,
        "Dashboards": sofia.id,
        "Integrations": leo.id,
        "Design System": sofia.id,
        "Realtime": priya.id,
        "Shell": jamal.id,
        "Attachments": jamal.id,
    }
    for name, oid in owners.items():
        c = Component(project_id=project.id, name=name, default_owner_id=oid)
        db.add(c)
        db.flush()
        comps[name] = c

    sla_map = {
        Severity.blocker: (1, 8),
        Severity.critical: (2, 24),
        Severity.major: (8, 72),
        Severity.minor: (24, 168),
        Severity.trivial: (48, 336),
    }
    for sev, (r, z) in sla_map.items():
        db.add(SLA(project_id=project.id, severity=sev, response_hours=r, resolution_hours=z))

    now = datetime.utcnow()
    created_issues: list[Issue] = []
    assignees = [priya, leo, jamal, maya, sofia]

    for idx, spec in enumerate(SEED_ISSUES, start=1):
        created = now - timedelta(days=18 - idx, hours=idx)
        resolved = spec["status"] in {Status.RESOLVED, Status.VERIFIED, Status.CLOSED, Status.WONTFIX, Status.DUPLICATE, Status.CANNOT_REPRODUCE}
        issue = Issue(
            number=idx,
            project_id=project.id,
            component_id=comps[spec["component"]].id,
            title=spec["title"],
            description=spec["description"],
            type=spec["type"],
            severity=spec["severity"],
            priority={
                Severity.blocker: Priority.P0,
                Severity.critical: Priority.P1,
                Severity.major: Priority.P2,
                Severity.minor: Priority.P3,
                Severity.trivial: Priority.P4,
            }[spec["severity"]],
            status=spec["status"],
            resolution=spec.get("resolution", Resolution.none),
            reporter_id=sofia.id if idx % 3 == 0 else (leo.id if idx % 2 == 0 else jamal.id),
            assignee_id=assignees[idx % len(assignees)].id,
            environment=spec["env"],
            labels=spec["labels"],
            version="2026.8",
            github_pr=spec.get("github_pr", ""),
            ci_status=spec.get("ci", ""),
            embedding=dump_embedding(hash_embed(spec["title"] + " " + spec["description"])),
            created_at=created,
            updated_at=now - timedelta(hours=idx),
            first_response_at=created + timedelta(hours=2) if idx % 4 else None,
            resolved_at=(created + timedelta(days=2)) if resolved else None,
        )
        db.add(issue)
        db.flush()
        created_issues.append(issue)
        db.add(StatusHistory(issue_id=issue.id, from_status="-", to_status=Status.NEW.value, changed_by=issue.reporter_id, note="created", changed_at=created))
        if issue.status != Status.NEW:
            db.add(
                StatusHistory(
                    issue_id=issue.id,
                    from_status=Status.NEW.value,
                    to_status=issue.status.value,
                    changed_by=issue.assignee_id or jamal.id,
                    note="triaged in seed",
                    changed_at=created + timedelta(hours=5),
                )
            )
        db.add(Watch(user_id=issue.reporter_id, issue_id=issue.id))
        if issue.assignee_id and issue.assignee_id != issue.reporter_id:
            db.add(Watch(user_id=issue.assignee_id, issue_id=issue.id))

    # Duplicate link: issue 2 looks like issue 1
    created_issues[1].duplicate_of_id = created_issues[0].id
    db.add(Dependency(issue_id=created_issues[0].id, depends_on_issue_id=created_issues[7].id, type=DependencyType.related))
    db.add(Dependency(issue_id=created_issues[3].id, depends_on_issue_id=created_issues[0].id, type=DependencyType.blocks))
    db.add(Dependency(issue_id=created_issues[7].id, depends_on_issue_id=created_issues[4].id, type=DependencyType.blocks))

    for num, thread in COMMENTS.items():
        issue = created_issues[num - 1]
        t = issue.created_at + timedelta(hours=3)
        for author_idx, body, internal in thread:
            db.add(
                Comment(
                    issue_id=issue.id,
                    author_id=users[author_idx - 1].id,
                    body=body,
                    is_internal=internal,
                    created_at=t,
                )
            )
            t += timedelta(hours=5)

    db.add(
        SavedQuery(
            user_id=maya.id,
            name="P0/P1 open blockers",
            filter_json='{"op":"AND","rules":[{"field":"priority","op":"in","value":["P0","P1"]},{"field":"status","op":"neq","value":"CLOSED"}]}',
            is_shared=True,
        )
    )
    db.add(
        SavedQuery(
            user_id=jamal.id,
            name="My IN_PROGRESS",
            filter_json=f'{{"op":"AND","rules":[{{"field":"assignee_id","op":"eq","value":{priya.id}}},{{"field":"status","op":"eq","value":"IN_PROGRESS"}}]}}',
            is_shared=False,
        )
    )
    db.add(
        Notification(
            user_id=priya.id,
            issue_id=created_issues[0].id,
            type=NotificationType.assigned,
            message="You were assigned NT-1: Login form submits twice",
        )
    )
    db.add(Webhook(project_id=project.id, url="https://hooks.example.com/slack", kind="slack", enabled=True))
    db.commit()
