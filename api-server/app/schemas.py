from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class AuthRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    refresh_token: str


class CaptureListItem(BaseModel):
    id: UUID
    source_platform: str
    source_url: str
    source_title: str
    content_hash: str
    source_fingerprint: str
    session_id: str = ""
    extraction_quality: dict
    metadata: dict
    analysis_status: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class CaptureCreateRequest(BaseModel):
    session_id: str = ""
    source: dict
    content: dict
    extraction_quality: dict
    hashes: dict
    metadata: dict | None = None


class CaptureCreateResponse(BaseModel):
    id: UUID
    created: bool
    updated_at: datetime


class CaptureDetailResponse(CaptureListItem):
    messages: list[dict]
