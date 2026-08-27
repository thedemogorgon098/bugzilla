from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Role, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

ROLE_RANK = {
    Role.guest: 0,
    Role.reporter: 1,
    Role.developer: 2,
    Role.maintainer: 3,
    Role.admin: 4,
}

INTERNAL_COMMENT_ROLES = {Role.admin, Role.maintainer, Role.developer}


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode("utf-8")[:72]
        return bcrypt.checkpw(pwd_bytes, hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(sub: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": sub, "exp": expire}, settings.secret_key, algorithm=settings.algorithm)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    creds_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        email = payload.get("sub")
        if not email:
            raise creds_exc
    except JWTError as exc:
        raise creds_exc from exc
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise creds_exc
    return user


def require_role(*roles: Role):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and user.role != Role.admin:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user

    return checker


def require_rank(min_role: Role):
    def checker(user: User = Depends(get_current_user)) -> User:
        if ROLE_RANK[user.role] < ROLE_RANK[min_role]:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return checker


def can_see_internal(user: User) -> bool:
    return user.role in INTERNAL_COMMENT_ROLES
