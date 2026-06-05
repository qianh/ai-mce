from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Capture, User
from app.schemas import CaptureCreateRequest, CaptureCreateResponse, CaptureDetailResponse, CaptureListItem
from app.security import get_current_user

router = APIRouter(prefix="/v1/captures", tags=["captures"])


def _capture_item(capture: Capture) -> CaptureListItem:
    return CaptureListItem(
        id=capture.id,
        source_platform=capture.source_platform,
        source_url=capture.source_url,
        source_title=capture.source_title,
        content_hash=capture.content_hash,
        source_fingerprint=capture.source_fingerprint,
        extraction_quality=capture.extraction_quality,
        metadata=capture.metadata_json,
        analysis_status=capture.analysis_status,
        message_count=len(capture.messages),
        created_at=capture.created_at,
        updated_at=capture.updated_at,
    )


def _capture_detail(capture: Capture) -> CaptureDetailResponse:
    item = _capture_item(capture).model_dump()
    return CaptureDetailResponse(**item, messages=capture.messages)


def _capture_values(req: CaptureCreateRequest) -> dict:
    source = req.source
    content = req.content
    hashes = req.hashes
    messages = list(content.get("messages") or [])
    return {
        "source_platform": source["platform"],
        "source_url": source["url"],
        "source_title": content.get("title") or source.get("browser_title") or "",
        "content_hash": hashes["content_hash"],
        "source_fingerprint": hashes.get("source_fingerprint") or "",
        "extraction_quality": req.extraction_quality,
        "messages": messages,
        "metadata_json": {
            "source": source,
            "metadata": req.metadata or {},
            "message_hashes": hashes.get("message_hashes") or [],
        },
        "analysis_status": "not_started",
    }


@router.post("", response_model=CaptureCreateResponse)
def create_capture(
    req: CaptureCreateRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CaptureCreateResponse:
    values = _capture_values(req)
    fingerprint = values["source_fingerprint"]
    existing = None
    if fingerprint:
        existing = db.scalar(
            select(Capture).where(
                Capture.user_id == current_user.id,
                Capture.source_fingerprint == fingerprint,
            )
        )

    now = datetime.now(UTC)
    if existing is not None:
        for key, value in values.items():
            setattr(existing, key, value)
        existing.updated_at = now
        db.add(existing)
        db.commit()
        db.refresh(existing)
        response.status_code = status.HTTP_200_OK
        return CaptureCreateResponse(id=existing.id, created=False, updated_at=existing.updated_at)

    capture = Capture(user_id=current_user.id, **values)
    db.add(capture)
    db.commit()
    db.refresh(capture)
    response.status_code = status.HTTP_201_CREATED
    return CaptureCreateResponse(id=capture.id, created=True, updated_at=capture.updated_at)


@router.get("", response_model=list[CaptureListItem])
def list_captures(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[CaptureListItem]:
    captures = db.scalars(
        select(Capture)
        .where(Capture.user_id == current_user.id)
        .order_by(desc(Capture.created_at))
    ).all()
    return [_capture_item(capture) for capture in captures]


@router.get("/{capture_id}", response_model=CaptureDetailResponse)
def get_capture(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CaptureDetailResponse:
    capture = db.get(Capture, capture_id)
    if capture is None or capture.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    return _capture_detail(capture)


@router.delete("/{capture_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_capture(
    capture_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    capture = db.get(Capture, capture_id)
    if capture is None or capture.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    db.delete(capture)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
