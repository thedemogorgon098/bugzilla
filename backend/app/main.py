from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
import socketio

from app.auth import get_current_user
from app.config import settings
from app.database import Base, engine, SessionLocal
from app.models import RootCauseInvestigation
from app.realtime import sio
from app.routers import ai, attachments, auth, dashboard, github, issues, notifications, projects, search
from app.seed import seed

limiter = Limiter(key_func=get_remote_address)

fastapi_app = FastAPI(
    title="NexusTrack API",
    description="Modern bug & issue tracking — Bugzilla rigor, Linear-grade UX, AI triage.",
    version="1.0.0",
)
RootCauseInvestigation.__table__.create(bind=engine, checkfirst=True)
fastapi_app.state.limiter = limiter
fastapi_app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@fastapi_app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@fastapi_app.on_event("startup")
def on_startup():
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    # Keep the demo's create-all startup compatible with databases created before investigations existed.
    RootCauseInvestigation.__table__.create(bind=engine, checkfirst=True)
    db = SessionLocal()
    try:
        seed(db)
    finally:
        db.close()


@fastapi_app.get("/health")
def health():
    return {"ok": True, "service": "nexustrack"}


@fastapi_app.get("/")
def root():
    return {
        "name": "NexusTrack",
        "jobs": ["capture", "route", "track", "collaborate", "query"],
        "docs": "/docs",
    }


fastapi_app.include_router(auth.router)
fastapi_app.include_router(projects.router)
fastapi_app.include_router(issues.router)
fastapi_app.include_router(search.router)
fastapi_app.include_router(dashboard.router)
fastapi_app.include_router(notifications.router)
fastapi_app.include_router(github.router)
fastapi_app.include_router(ai.router)
fastapi_app.include_router(attachments.router)


@fastapi_app.get("/users")
def users(_: object = Depends(get_current_user)):
    from app.models import User
    from app.schemas import UserOut

    db = SessionLocal()
    try:
        return [UserOut.model_validate(u) for u in db.query(User).order_by(User.name).all()]
    finally:
        db.close()


@fastapi_app.get("/meta/lifecycle")
def lifecycle():
    from app.services.state_machine import DEFAULT_TRANSITIONS

    return {k.value: [s.value for s in v] for k, v in DEFAULT_TRANSITIONS.items()}


app = socketio.ASGIApp(sio, other_asgi_app=fastapi_app)
