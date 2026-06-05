from datetime import UTC, datetime, timedelta
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User

_password_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: UUID) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expires_at},
        settings.jwt_secret,
        algorithm="HS256",
    )


def new_refresh_token() -> str:
    return token_urlsafe(48)


def hash_refresh_token(refresh_token: str) -> str:
    return sha256(refresh_token.encode("utf-8")).hexdigest()


def refresh_expires_at() -> datetime:
    return datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days)


def decode_access_token(token: str) -> UUID:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
        return UUID(str(payload["sub"]))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user
