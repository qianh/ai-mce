from fastapi.testclient import TestClient

from app.main import create_app


class FakeSupabaseClient:
    def __init__(self):
        self.users: dict[str, dict] = {}
        self.tokens: dict[str, str] = {}
        self.captures: dict[str, list[dict]] = {}
        self.next_user = 1
        self.next_capture = 1

    def register(self, email: str, password: str) -> dict:
        user_id = f"00000000-0000-0000-0000-{self.next_user:012d}"
        self.next_user += 1
        user = {"id": user_id, "email": email, "password_hash": f"hash:{password}"}
        self.users[email] = user
        return user

    def store_refresh_token(self, user_id: str, refresh_token: str, expires_at) -> None:
        self.tokens[refresh_token] = user_id

    def create_or_update_capture(self, user_id: str, req) -> tuple[dict, bool]:
        rows = self.captures.setdefault(user_id, [])
        fingerprint = req.hashes.get("source_fingerprint") or ""
        existing = next((row for row in rows if row["source_fingerprint"] == fingerprint and fingerprint), None)
        row = self._row_from_request(req, user_id, existing["id"] if existing else None)
        if existing:
            existing.update(row)
            return existing, False
        rows.insert(0, row)
        return row, True

    def list_captures(self, user_id: str) -> list[dict]:
        return list(self.captures.get(user_id, []))

    def get_capture(self, user_id: str, capture_id: str) -> dict | None:
        return next((row for row in self.captures.get(user_id, []) if row["id"] == capture_id), None)

    def delete_capture(self, user_id: str, capture_id: str) -> bool:
        rows = self.captures.get(user_id, [])
        before = len(rows)
        self.captures[user_id] = [row for row in rows if row["id"] != capture_id]
        return len(self.captures[user_id]) != before

    def _row_from_request(self, req, user_id: str, capture_id: str | None) -> dict:
        capture_id = capture_id or f"10000000-0000-0000-0000-{self.next_capture:012d}"
        if capture_id.endswith(f"{self.next_capture:012d}"):
            self.next_capture += 1
        messages = list(req.content.get("messages") or [])
        return {
            "id": capture_id,
            "user_id": user_id,
            "source_platform": req.source["platform"],
            "source_url": req.source["url"],
            "source_title": req.content.get("title") or req.source.get("browser_title") or "",
            "content_hash": req.hashes["content_hash"],
            "source_fingerprint": req.hashes.get("source_fingerprint") or "",
            "extraction_quality": req.extraction_quality,
            "metadata": {
                "source": req.source,
                "metadata": req.metadata or {},
                "message_hashes": req.hashes.get("message_hashes") or [],
            },
            "messages": messages,
            "analysis_status": "not_started",
            "message_count": len(messages),
            "created_at": "2026-06-05T10:00:00Z",
            "updated_at": "2026-06-05T10:00:00Z",
        }


def make_client():
    return TestClient(create_app(supabase_client=FakeSupabaseClient()))


def register(client: TestClient, email: str) -> str:
    response = client.post("/v1/auth/register", json={"email": email, "password": "secret123"})
    assert response.status_code == 201
    return response.json()["access_token"]


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def payload(title: str = "Cloud Mode Spec", fingerprint: str = "chatgpt:abc") -> dict:
    return {
        "source": {
            "platform": "chatgpt",
            "url": "https://chatgpt.com/c/abc",
            "browser_title": title,
            "captured_at": "2026-06-05T10:00:00.000Z",
        },
        "content": {
            "title": title,
            "messages": [
                {"role": "user", "content": "Need cloud mode", "index": 0},
                {"role": "assistant", "content": "Use Supabase", "index": 1},
            ],
        },
        "extraction_quality": {
            "confidence": 0.9,
            "method": "dom_attr",
            "warnings": [],
            "message_count": 2,
            "empty_message_count": 0,
        },
        "hashes": {
            "content_hash": "hash-1",
            "message_hashes": ["m1", "m2"],
            "source_fingerprint": fingerprint,
        },
        "metadata": {"conversation_id": "abc"},
    }


def test_create_list_detail_and_no_ai_analysis():
    client = make_client()
    token = register(client, "a@example.com")

    created = client.post("/v1/captures", json=payload(), headers=auth(token))

    assert created.status_code == 201
    capture_id = created.json()["id"]
    assert created.json()["created"] is True

    listed = client.get("/v1/captures", headers=auth(token))
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [capture_id]
    assert listed.json()[0]["message_count"] == 2
    assert listed.json()[0]["analysis_status"] == "not_started"

    detail = client.get(f"/v1/captures/{capture_id}", headers=auth(token))
    assert detail.status_code == 200
    assert detail.json()["messages"][1]["content"] == "Use Supabase"
    assert detail.json()["extraction_quality"]["confidence"] == 0.9
    assert detail.json()["analysis_status"] == "not_started"


def test_upsert_by_user_and_source_fingerprint():
    client = make_client()
    token = register(client, "a@example.com")

    first = client.post("/v1/captures", json=payload(title="First"), headers=auth(token))
    second = client.post("/v1/captures", json=payload(title="Updated"), headers=auth(token))

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["created"] is False

    listed = client.get("/v1/captures", headers=auth(token)).json()
    assert len(listed) == 1
    assert listed[0]["source_title"] == "Updated"


def test_users_are_isolated_for_list_detail_and_delete():
    client = make_client()
    token_a = register(client, "a@example.com")
    token_b = register(client, "b@example.com")

    created = client.post("/v1/captures", json=payload(), headers=auth(token_a))
    capture_id = created.json()["id"]

    assert client.get("/v1/captures", headers=auth(token_b)).json() == []
    assert client.get(f"/v1/captures/{capture_id}", headers=auth(token_b)).status_code == 404
    assert client.delete(f"/v1/captures/{capture_id}", headers=auth(token_b)).status_code == 404

    deleted = client.delete(f"/v1/captures/{capture_id}", headers=auth(token_a))
    assert deleted.status_code == 204
    assert client.get(f"/v1/captures/{capture_id}", headers=auth(token_a)).status_code == 404
