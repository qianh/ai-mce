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
            assert request.url.params["source_fingerprint"] == "eq.chatgpt:abc"
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
    assert [call.method for call in calls] == ["GET", "POST"]
