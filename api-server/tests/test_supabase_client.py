import json

import httpx

from app.schemas import CaptureCreateRequest
from app.supabase_client import SupabaseRestClient


def test_register_inserts_business_user_with_service_key():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.method == "POST"
        assert request.url.path == "/rest/v1/users"
        assert request.headers["apikey"] == "service-key"
        assert request.headers["Authorization"] == "Bearer service-key"
        body = json.loads(request.content)
        assert body["email"] == "me@example.com"
        assert body["password_hash"] != "secret123"
        return httpx.Response(201, json=[{
            "id": "11111111-1111-1111-1111-111111111111",
            "email": "me@example.com",
            "password_hash": body["password_hash"],
            "created_at": "2026-06-05T10:00:00Z",
            "updated_at": "2026-06-05T10:00:00Z",
        }])

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result = client.register("me@example.com", "secret123")

    assert result["email"] == "me@example.com"
    assert len(calls) == 1


def test_create_capture_uses_service_key_and_business_user_id():
    calls = []
    row = {
        "id": "22222222-2222-2222-2222-222222222222",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "chatgpt",
        "source_url": "https://chatgpt.com/c/abc",
        "source_title": "Cloud Spec",
        "content_hash": "hash-1",
        "source_fingerprint": "chatgpt:abc",
        "extraction_quality": {"confidence": 0.9},
        "messages": [{"role": "user", "content": "hello", "index": 0}],
        "metadata": {"metadata": {"conversation_id": "abc"}},
        "analysis_status": "not_started",
        "created_at": "2026-06-05T10:00:00Z",
        "updated_at": "2026-06-05T10:00:00Z",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.headers["apikey"] == "service-key"
        assert request.headers["Authorization"] == "Bearer service-key"
        if request.method == "GET":
            assert request.url.path == "/rest/v1/captures"
            assert request.url.params["user_id"] == "eq.11111111-1111-1111-1111-111111111111"
            return httpx.Response(200, json=[])
        assert request.method == "POST"
        assert request.url.path == "/rest/v1/captures"
        assert "return=representation" in request.headers["Prefer"]
        body = json.loads(request.content)
        assert body["user_id"] == "11111111-1111-1111-1111-111111111111"
        assert body["source_title"] == "Cloud Spec"
        assert body["messages"][0]["content"] == "hello"
        return httpx.Response(201, json=[row])

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    created, is_created = client.create_or_update_capture("11111111-1111-1111-1111-111111111111", CaptureCreateRequest(
        source={
            "platform": "chatgpt",
            "url": "https://chatgpt.com/c/abc",
            "browser_title": "Cloud Spec",
            "captured_at": "2026-06-05T10:00:00.000Z",
        },
        content={
            "title": "Cloud Spec",
            "messages": [{"role": "user", "content": "hello", "index": 0}],
        },
        extraction_quality={"confidence": 0.9},
        hashes={
            "content_hash": "hash-1",
            "message_hashes": ["m1"],
            "source_fingerprint": "chatgpt:abc",
        },
        metadata={"conversation_id": "abc"},
    ))

    assert created["id"] == "22222222-2222-2222-2222-222222222222"
    assert is_created is True
    assert [call.method for call in calls] == ["GET", "GET", "POST"]


def test_create_capture_updates_by_source_fingerprint_when_content_changes():
    """Same conversation re-captured with new messages: content_hash differs, fingerprint matches → PATCH."""
    calls = []
    existing_row = {
        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "chatgpt",
        "source_url": "https://chatgpt.com/c/abc",
        "source_title": "Original Title",
        "content_hash": "old-hash",
        "source_fingerprint": "chatgpt:abc",
        "extraction_quality": {"confidence": 0.9},
        "messages": [{"role": "user", "content": "old message", "index": 0}],
        "metadata": {},
        "analysis_status": "not_started",
        "message_count": 1,
        "created_at": "2026-06-05T10:00:00Z",
        "updated_at": "2026-06-05T10:00:00Z",
    }
    updated_row = {**existing_row, "source_title": "Updated Title", "content_hash": "new-hash", "message_count": 2, "updated_at": "2026-06-05T11:00:00Z"}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            # First GET: content_hash lookup → no match (new hash)
            if request.url.params.get("content_hash") == "eq.new-hash":
                return httpx.Response(200, json=[])
            # Second GET: source_fingerprint lookup → match!
            if request.url.params.get("source_fingerprint") == "eq.chatgpt:abc":
                return httpx.Response(200, json=[existing_row])
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            return httpx.Response(200, json=[updated_row])
        return httpx.Response(500)

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result, is_created = client.create_or_update_capture(
        "11111111-1111-1111-1111-111111111111",
        CaptureCreateRequest(
            source={
                "platform": "chatgpt",
                "url": "https://chatgpt.com/c/abc",
                "browser_title": "Updated Title",
                "captured_at": "2026-06-05T11:00:00.000Z",
            },
            content={
                "title": "Updated Title",
                "messages": [
                    {"role": "user", "content": "old message", "index": 0},
                    {"role": "assistant", "content": "new reply", "index": 1},
                ],
            },
            extraction_quality={"confidence": 0.9},
            hashes={
                "content_hash": "new-hash",
                "message_hashes": ["m1", "m2"],
                "source_fingerprint": "chatgpt:abc",
            },
        ),
    )

    assert is_created is False
    assert result["source_title"] == "Updated Title"
    assert result["content_hash"] == "new-hash"
    # GET(content_hash) → GET(fingerprint) → PATCH
    assert [call.method for call in calls] == ["GET", "GET", "PATCH"]


def test_create_capture_replaces_by_session_id():
    """Desktop re-upload of the same session (new content): session_id matches → full replace PATCH."""
    calls = []
    existing_row = {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "claude",
        "source_url": "desktop",
        "source_title": "Session A",
        "content_hash": "old-hash",
        "source_fingerprint": "claude:desktop",
        "session_id": "sess-001",
        "extraction_quality": {"confidence": 1.0},
        "messages": [{"role": "user", "content": "old", "index": 0}],
        "metadata": {},
        "analysis_status": "not_started",
        "message_count": 5,
        "created_at": "2026-06-12T10:00:00Z",
        "updated_at": "2026-06-12T10:00:00Z",
    }
    updated_row = {**existing_row, "content_hash": "new-hash", "message_count": 8, "updated_at": "2026-06-12T11:00:00Z"}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            # session_id lookup must be scoped by platform
            if request.url.params.get("session_id") == "eq.sess-001":
                assert request.url.params.get("source_platform") == "eq.claude"
                return httpx.Response(200, json=[existing_row])
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            body = json.loads(request.content)
            # full replace: messages and message_count are overwritten
            assert "messages" in body
            assert body["message_count"] == 8
            assert body["session_id"] == "sess-001"
            return httpx.Response(200, json=[updated_row])
        return httpx.Response(500)

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result, is_created = client.create_or_update_capture(
        "11111111-1111-1111-1111-111111111111",
        CaptureCreateRequest(
            session_id="sess-001",
            source={
                "platform": "claude",
                "url": "desktop",
                "browser_title": "Session A",
                "captured_at": "2026-06-12T11:00:00.000Z",
            },
            content={
                "title": "Session A",
                "messages": [{"role": "user", "content": f"msg {i}", "index": i} for i in range(8)],
            },
            extraction_quality={"confidence": 1.0},
            hashes={
                "content_hash": "new-hash",
                "message_hashes": [],
                "source_fingerprint": "claude:desktop",
            },
        ),
    )

    assert is_created is False
    assert result["content_hash"] == "new-hash"
    assert result["message_count"] == 8
    # session_id lookup hits → PATCH directly, no content_hash / fingerprint lookups
    assert [call.method for call in calls] == ["GET", "PATCH"]


def test_create_capture_replaces_by_session_id_even_with_fewer_messages():
    """Desktop session truncated/rewritten: replace takes the file as-is, no message_count >= guard."""
    calls = []
    existing_row = {
        "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "claude",
        "session_id": "sess-001",
        "message_count": 20,
        "content_hash": "old-hash",
    }
    updated_row = {**existing_row, "content_hash": "small-hash", "message_count": 4, "updated_at": "2026-06-12T12:00:00Z"}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            if request.url.params.get("session_id") == "eq.sess-001":
                return httpx.Response(200, json=[existing_row])
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            body = json.loads(request.content)
            assert "messages" in body, "session_id replace must overwrite messages even when fewer"
            assert body["message_count"] == 4
            return httpx.Response(200, json=[updated_row])
        return httpx.Response(500)

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result, is_created = client.create_or_update_capture(
        "11111111-1111-1111-1111-111111111111",
        CaptureCreateRequest(
            session_id="sess-001",
            source={"platform": "claude", "url": "desktop", "browser_title": "Session A", "captured_at": "2026-06-12T12:00:00.000Z"},
            content={"title": "Session A", "messages": [{"role": "user", "content": f"m{i}", "index": i} for i in range(4)]},
            extraction_quality={"confidence": 1.0},
            hashes={"content_hash": "small-hash", "message_hashes": [], "source_fingerprint": "claude:desktop"},
        ),
    )

    assert is_created is False
    assert result["message_count"] == 4


def test_create_capture_with_session_id_skips_fingerprint_match():
    """Two different desktop sessions share fingerprint 'claude:desktop' — must NOT merge."""
    calls = []
    other_session_row = {
        "id": "cccccccc-cccc-cccc-cccc-cccccccccccc",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "claude",
        "session_id": "sess-OTHER",
        "source_fingerprint": "claude:desktop",
        "content_hash": "other-hash",
        "message_count": 10,
    }
    new_row = {
        "id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "claude",
        "session_id": "sess-002",
        "source_fingerprint": "claude:desktop",
        "content_hash": "hash-002",
        "message_count": 6,
        "created_at": "2026-06-12T11:00:00Z",
        "updated_at": "2026-06-12T11:00:00Z",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            if request.url.params.get("session_id") == "eq.sess-002":
                return httpx.Response(200, json=[])
            if request.url.params.get("content_hash") == "eq.hash-002":
                return httpx.Response(200, json=[])
            if request.url.params.get("source_fingerprint"):
                raise AssertionError("fingerprint lookup must be skipped when session_id is present")
            return httpx.Response(200, json=[])
        if request.method == "POST":
            body = json.loads(request.content)
            assert body["session_id"] == "sess-002"
            return httpx.Response(201, json=[new_row])
        return httpx.Response(500)

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result, is_created = client.create_or_update_capture(
        "11111111-1111-1111-1111-111111111111",
        CaptureCreateRequest(
            session_id="sess-002",
            source={"platform": "claude", "url": "desktop", "browser_title": "Session B", "captured_at": "2026-06-12T11:00:00.000Z"},
            content={"title": "Session B", "messages": [{"role": "user", "content": f"m{i}", "index": i} for i in range(6)]},
            extraction_quality={"confidence": 1.0},
            hashes={"content_hash": "hash-002", "message_hashes": [], "source_fingerprint": "claude:desktop"},
        ),
    )

    assert is_created is True
    assert result["id"] == "dddddddd-dddd-dddd-dddd-dddddddddddd"
    # GET(session_id) → GET(content_hash) → POST; no fingerprint GET
    assert [call.method for call in calls] == ["GET", "GET", "POST"]


def test_create_capture_content_hash_match_does_not_steal_other_sessions_id():
    """Two distinct sessions with identical content (copied file): content_hash hit on the
    OTHER session must not overwrite its session_id, else the unique index breaks / the
    other session gets hijacked."""
    calls = []
    other_session_row = {
        "id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        "message_count": 2,
        "session_id": "sess-ORIGINAL",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            if request.url.params.get("session_id") == "eq.sess-COPY":
                return httpx.Response(200, json=[])
            if request.url.params.get("content_hash") == "eq.same-hash":
                return httpx.Response(200, json=[other_session_row])
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            body = json.loads(request.content)
            assert body.get("session_id") != "sess-COPY", (
                "content_hash match on a different session must not overwrite its session_id"
            )
            return httpx.Response(200, json=[{**other_session_row, "updated_at": "2026-06-12T12:00:00Z"}])
        return httpx.Response(500)

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    _, is_created = client.create_or_update_capture(
        "11111111-1111-1111-1111-111111111111",
        CaptureCreateRequest(
            session_id="sess-COPY",
            source={"platform": "claude", "url": "desktop", "browser_title": "Copy", "captured_at": "2026-06-12T12:00:00.000Z"},
            content={"title": "Copy", "messages": [{"role": "user", "content": "same", "index": 0}, {"role": "assistant", "content": "same", "index": 1}]},
            extraction_quality={"confidence": 1.0},
            hashes={"content_hash": "same-hash", "message_hashes": [], "source_fingerprint": "claude:desktop"},
        ),
    )

    assert is_created is False


def test_create_capture_preserves_messages_when_partial_recapture():
    """
    Re-capturing the same conversation with FEWER messages (lazy-loaded page) must not
    overwrite the existing message data — only metadata is patched.
    """
    calls = []
    existing_row = {
        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "user_id": "11111111-1111-1111-1111-111111111111",
        "source_platform": "chatgpt",
        "source_url": "https://chatgpt.com/c/abc",
        "source_title": "Long Chat",
        "content_hash": "old-hash",
        "source_fingerprint": "chatgpt:abc",
        "extraction_quality": {"confidence": 0.9},
        "messages": [{"role": "user", "content": f"msg {i}", "index": i} for i in range(20)],
        "metadata": {},
        "analysis_status": "not_started",
        "message_count": 20,
        "created_at": "2026-06-05T10:00:00Z",
        "updated_at": "2026-06-05T10:00:00Z",
    }
    # Server returns the preserved row (message_count unchanged)
    preserved_row = {**existing_row, "source_title": "Long Chat (continued)", "updated_at": "2026-06-05T12:00:00Z"}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "GET":
            if request.url.params.get("content_hash") == "eq.partial-hash":
                return httpx.Response(200, json=[])
            if request.url.params.get("source_fingerprint") == "eq.chatgpt:abc":
                return httpx.Response(200, json=[existing_row])
            return httpx.Response(200, json=[])
        if request.method == "PATCH":
            body = json.loads(request.content)
            assert "messages" not in body, "messages must not be overwritten on partial recapture"
            assert "message_count" not in body, "message_count must not be overwritten on partial recapture"
            return httpx.Response(200, json=[preserved_row])
        return httpx.Response(500)

    client = SupabaseRestClient(
        "https://example.supabase.co",
        "service-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    result, is_created = client.create_or_update_capture(
        "11111111-1111-1111-1111-111111111111",
        CaptureCreateRequest(
            source={
                "platform": "chatgpt",
                "url": "https://chatgpt.com/c/abc",
                "browser_title": "Long Chat (continued)",
                "captured_at": "2026-06-05T12:00:00.000Z",
            },
            content={
                "title": "Long Chat (continued)",
                "messages": [{"role": "user", "content": "only recent msg", "index": 0}],
            },
            extraction_quality={"confidence": 0.6},
            hashes={
                "content_hash": "partial-hash",
                "message_hashes": ["m1"],
                "source_fingerprint": "chatgpt:abc",
            },
        ),
    )

    assert is_created is False
    assert result["message_count"] == 20  # existing count preserved
    assert [call.method for call in calls] == ["GET", "GET", "PATCH"]
