from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import RefreshToken, User
from app.schemas import AuthRequest, AuthResponse, RefreshRequest, UserResponse
from app.security import (
    create_access_token,
    hash_password,
    hash_refresh_token,
    new_refresh_token,
    refresh_expires_at,
    verify_password,
)

router = APIRouter(prefix="/v1/auth", tags=["auth"])


def _as_utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def _auth_response(db: Session, user: User) -> AuthResponse:
    refresh_token = new_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(refresh_token),
            expires_at=refresh_expires_at(),
        )
    )
    db.commit()
    return AuthResponse(
        user=UserResponse(id=user.id, email=user.email),
        access_token=create_access_token(user.id),
        refresh_token=refresh_token,
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(req: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    email = req.email.lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(email=email, password_hash=hash_password(req.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_response(db, user)


@router.post("/login", response_model=AuthResponse)
def login(req: AuthRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == req.email.lower()))
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _auth_response(db, user)


@router.post("/refresh", response_model=AuthResponse)
def refresh(req: RefreshRequest, db: Session = Depends(get_db)) -> AuthResponse:
    token_hash = hash_refresh_token(req.refresh_token)
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    now = datetime.now(UTC)
    if token is None or token.revoked_at is not None or _as_utc(token.expires_at) <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.get(User, token.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    token.revoked_at = now
    db.add(token)
    db.commit()
    return _auth_response(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(req: RefreshRequest, db: Session = Depends(get_db)) -> Response:
    token_hash = hash_refresh_token(req.refresh_token)
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    if token is not None and token.revoked_at is None:
        token.revoked_at = datetime.now(UTC)
        db.add(token)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
