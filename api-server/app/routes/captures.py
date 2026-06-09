from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.schemas import CaptureCreateRequest, CaptureCreateResponse, CaptureDetailResponse, CaptureListItem
from app.security import decode_access_token
from app.supabase_client import SupabaseApiError, SupabaseRestClient, get_supabase_client

router = APIRouter(prefix="/v1/captures", tags=["captures"])
_bearer = HTTPBearer(auto_error=False)


def current_user_id(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return str(decode_access_token(credentials.credentials))


def _capture_item(row: dict) -> CaptureListItem:
    messages = list(row.get("messages") or [])
    return CaptureListItem(
        id=row["id"],
        source_platform=row["source_platform"],
        source_url=row["source_url"],
        source_title=row["source_title"],
        content_hash=row["content_hash"],
        source_fingerprint=row["source_fingerprint"],
        extraction_quality=row["extraction_quality"],
        metadata=row["metadata"],
        analysis_status=row["analysis_status"],
        message_count=row.get("message_count") or len(messages),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _capture_detail(row: dict) -> CaptureDetailResponse:
    item = _capture_item(row).model_dump()
    return CaptureDetailResponse(**item, messages=list(row.get("messages") or []))


@router.post("", response_model=CaptureCreateResponse)
def create_capture(
    req: CaptureCreateRequest,
    response: Response,
    user_id: str = Depends(current_user_id),
    client: SupabaseRestClient = Depends(get_supabase_client),
) -> CaptureCreateResponse:
    try:
        row, created = client.create_or_update_capture(user_id, req)
    except SupabaseApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return CaptureCreateResponse(id=row["id"], created=created, updated_at=row["updated_at"])


@router.get("", response_model=list[CaptureListItem])
def list_captures(
    source_side: str | None = Query(default=None, pattern="^(browser|desktop)$"),
    source_platform: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user_id: str = Depends(current_user_id),
    client: SupabaseRestClient = Depends(get_supabase_client),
) -> list[CaptureListItem]:
    try:
        return [
            _capture_item(row)
            for row in client.list_captures(
                user_id,
                source_side=source_side,
                source_platform=source_platform,
                limit=limit,
                offset=offset,
            )
        ]
    except SupabaseApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/{capture_id}", response_model=CaptureDetailResponse)
def get_capture(
    capture_id: UUID,
    user_id: str = Depends(current_user_id),
    client: SupabaseRestClient = Depends(get_supabase_client),
) -> CaptureDetailResponse:
    try:
        row = client.get_capture(user_id, str(capture_id))
    except SupabaseApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    return _capture_detail(row)


@router.delete("/{capture_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_capture(
    capture_id: UUID,
    user_id: str = Depends(current_user_id),
    client: SupabaseRestClient = Depends(get_supabase_client),
) -> Response:
    try:
        deleted = client.delete_capture(user_id, str(capture_id))
    except SupabaseApiError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capture not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
