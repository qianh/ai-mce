from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx

from app.config import get_settings
from app.schemas import CaptureCreateRequest
from app.security import hash_password, hash_refresh_token, verify_password


_DESKTOP_SOURCE_URL = "desktop"


class SupabaseApiError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class SupabaseRestClient:
    def __init__(self, supabase_url: str, service_role_key: str, http_client: httpx.Client | None = None):
        self.base_url = supabase_url.rstrip("/")
        self.service_role_key = service_role_key
        self.http = http_client or httpx.Client(
            timeout=20,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    def register(self, email: str, password: str) -> dict[str, Any]:
        rows = self._request(
            "POST",
            "/rest/v1/users",
            json={"email": email, "password_hash": hash_password(password)},
            prefer="return=representation",
        )
        return rows[0]

    def login(self, email: str, password: str) -> dict[str, Any]:
        rows = self._request(
            "GET",
            "/rest/v1/users",
            params={
                "select": "*",
                "email": f"eq.{email}",
                "limit": "1",
            },
        )
        if not rows or not verify_password(password, rows[0]["password_hash"]):
            raise SupabaseApiError(401, "Invalid login credentials")
        return rows[0]

    def store_refresh_token(self, user_id: str, refresh_token: str, expires_at) -> None:
        self._request(
            "POST",
            "/rest/v1/refresh_tokens",
            json={
                "user_id": user_id,
                "token_hash": hash_refresh_token(refresh_token),
                "expires_at": expires_at.isoformat(),
            },
        )

    def consume_refresh_token(self, refresh_token: str) -> dict[str, Any] | None:
        token_hash = hash_refresh_token(refresh_token)
        now = datetime.now(UTC)
        rows = self._request(
            "GET",
            "/rest/v1/refresh_tokens",
            params={
                "select": "*,users(*)",
                "token_hash": f"eq.{token_hash}",
                "revoked_at": "is.null",
                "expires_at": f"gt.{now.isoformat()}",
                "limit": "1",
            },
        )
        if not rows:
            return None

        token_row = rows[0]
        user = token_row.get("users")
        if not user:
            # Join returned no user — don't revoke so the client can retry.
            return None

        self._request(
            "PATCH",
            "/rest/v1/refresh_tokens",
            params={"id": f"eq.{token_row['id']}"},
            json={"revoked_at": now.isoformat()},
        )
        return user

    def touch_refresh_tokens(self, user_id: str, extend_days: int = 30) -> None:
        """Extend all active refresh tokens for a user (sliding expiration on activity)."""
        now = datetime.now(UTC)
        new_expiry = now + timedelta(days=extend_days)
        self._request(
            "PATCH",
            "/rest/v1/refresh_tokens",
            params={
                "user_id": f"eq.{user_id}",
                "revoked_at": "is.null",
            },
            json={"expires_at": new_expiry.isoformat()},
        )

    def logout(self, refresh_token: str) -> None:
        self._request(
            "PATCH",
            "/rest/v1/refresh_tokens",
            params={"token_hash": f"eq.{hash_refresh_token(refresh_token)}"},
            json={"revoked_at": datetime.now(UTC).isoformat()},
        )

    def _find_capture_by(self, user_id: str, field: str, value: str) -> dict[str, Any] | None:
        if not value:
            return None
        rows = self._request(
            "GET",
            "/rest/v1/captures",
            params={
                "select": "id",
                "user_id": f"eq.{user_id}",
                field: f"eq.{value}",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    def _update_capture(self, capture_id: str, values: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        rows = self._request(
            "PATCH",
            "/rest/v1/captures",
            params={"id": f"eq.{capture_id}"},
            json=values,
            prefer="return=representation",
        )
        return rows[0], False

    def create_or_update_capture(self, user_id: str, req: CaptureCreateRequest) -> tuple[dict[str, Any], bool]:
        values = capture_values(req)
        values["user_id"] = user_id

        # 1. Exact same content → update in place
        existing = self._find_capture_by(user_id, "content_hash", values["content_hash"])
        if existing is not None:
            return self._update_capture(existing["id"], values)

        # 2. Same conversation, new content → update existing record
        if values.get("source_fingerprint"):
            existing = self._find_capture_by(user_id, "source_fingerprint", values["source_fingerprint"])
            if existing is not None:
                return self._update_capture(existing["id"], values)

        # 3. Brand new capture → insert
        insert_values = {"id": str(uuid4()), **values}
        try:
            rows = self._request(
                "POST",
                "/rest/v1/captures",
                json=insert_values,
                prefer="return=representation",
            )
            return rows[0], True
        except SupabaseApiError as exc:
            if exc.status_code == 409:
                # Race: another request inserted between our checks. Retry by fingerprint.
                if values.get("source_fingerprint"):
                    existing = self._find_capture_by(user_id, "source_fingerprint", values["source_fingerprint"])
                    if existing is not None:
                        return self._update_capture(existing["id"], values)
                existing = self._find_capture_by(user_id, "content_hash", values["content_hash"])
                if existing:
                    return existing, False
            raise

    def list_captures(
        self,
        user_id: str,
        source_side: str | None = None,
        source_platform: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "select": "id,source_platform,source_url,source_title,content_hash,source_fingerprint,extraction_quality,analysis_status,message_count,created_at,updated_at",
            "user_id": f"eq.{user_id}",
            "order": "created_at.desc",
            "limit": str(limit),
            "offset": str(offset),
        }
        if source_side == "browser":
            params["source_url"] = f"neq.{_DESKTOP_SOURCE_URL}"
        elif source_side == "desktop":
            params["source_url"] = f"eq.{_DESKTOP_SOURCE_URL}"
        if source_platform:
            params["source_platform"] = f"eq.{source_platform}"
        return self._request("GET", "/rest/v1/captures", params=params)

    def get_capture(self, user_id: str, capture_id: str) -> dict[str, Any] | None:
        rows = self._request(
            "GET",
            "/rest/v1/captures",
            params={
                "select": "*",
                "id": f"eq.{capture_id}",
                "user_id": f"eq.{user_id}",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    def delete_capture(self, user_id: str, capture_id: str) -> bool:
        existing = self.get_capture(user_id, capture_id)
        if existing is None:
            return False
        self._request(
            "DELETE",
            "/rest/v1/captures",
            params={
                "id": f"eq.{capture_id}",
                "user_id": f"eq.{user_id}",
            },
        )
        return True

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json: dict[str, Any] | None = None,
        prefer: str | None = None,
    ) -> Any:
        headers = {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }
        if prefer:
            headers["Prefer"] = prefer

        response = self.http.request(
            method,
            f"{self.base_url}{path}",
            params=params,
            json=json,
            headers=headers,
        )
        if response.status_code >= 400:
            raise SupabaseApiError(response.status_code, _error_message(response))
        if response.status_code == 204 or not response.content:
            return None
        return response.json()

def capture_values(req: CaptureCreateRequest) -> dict[str, Any]:
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
        "message_count": len(messages),
        "metadata": {
            "source": source,
            "metadata": req.metadata or {},
            "message_hashes": hashes.get("message_hashes") or [],
        },
        "analysis_status": "not_started",
    }


def get_supabase_client() -> SupabaseRestClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise SupabaseApiError(500, "Supabase URL and service role key are required")
    return SupabaseRestClient(settings.supabase_url, settings.supabase_service_role_key)


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text or f"HTTP {response.status_code}"
    for key in ("message", "msg", "error_description", "error"):
        value = body.get(key)
        if isinstance(value, str):
            return value
    return f"HTTP {response.status_code}"
