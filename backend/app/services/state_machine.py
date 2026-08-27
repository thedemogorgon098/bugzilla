"""Server-side issue lifecycle. Illegal jumps are rejected."""

from app.models import Resolution, Status

DEFAULT_TRANSITIONS: dict[Status, set[Status]] = {
    Status.NEW: {Status.TRIAGED, Status.DUPLICATE, Status.WONTFIX, Status.CANNOT_REPRODUCE},
    Status.TRIAGED: {Status.IN_PROGRESS, Status.DUPLICATE, Status.WONTFIX, Status.CANNOT_REPRODUCE, Status.NEW},
    Status.IN_PROGRESS: {Status.IN_REVIEW, Status.RESOLVED, Status.TRIAGED, Status.WONTFIX},
    Status.IN_REVIEW: {Status.RESOLVED, Status.IN_PROGRESS, Status.REOPENED},
    Status.RESOLVED: {Status.VERIFIED, Status.REOPENED, Status.CLOSED},
    Status.VERIFIED: {Status.CLOSED, Status.REOPENED},
    Status.CLOSED: {Status.REOPENED},
    Status.REOPENED: {Status.TRIAGED, Status.IN_PROGRESS},
    Status.DUPLICATE: {Status.REOPENED, Status.CLOSED},
    Status.WONTFIX: {Status.REOPENED, Status.CLOSED},
    Status.CANNOT_REPRODUCE: {Status.REOPENED, Status.CLOSED},
}

RESOLUTION_FOR_STATUS = {
    Status.DUPLICATE: Resolution.duplicate,
    Status.WONTFIX: Resolution.wontfix,
    Status.CANNOT_REPRODUCE: Resolution.cannot_reproduce,
    Status.RESOLVED: Resolution.fixed,
    Status.VERIFIED: Resolution.fixed,
    Status.CLOSED: Resolution.fixed,
    Status.REOPENED: Resolution.none,
    Status.NEW: Resolution.none,
    Status.TRIAGED: Resolution.none,
    Status.IN_PROGRESS: Resolution.none,
    Status.IN_REVIEW: Resolution.none,
}


def can_transition(current: Status, target: Status) -> bool:
    if current == target:
        return True
    return target in DEFAULT_TRANSITIONS.get(current, set())


def allowed_from(current: Status) -> list[str]:
    return [s.value for s in sorted(DEFAULT_TRANSITIONS.get(current, set()), key=lambda x: x.value)]
