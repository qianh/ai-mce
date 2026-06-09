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

    def list_captures(
        self,
        user_id: str,
        source_side: str | None = None,
        source_platform: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> list[dict]:
        rows = list(self.captures.get(user_id, []))
        if source_side == "browser":
            rows = [r for r in rows if r["source_url"] != "desktop"]
        elif source_side == "desktop":
            rows = [r for r in rows if r["source_url"] == "desktop"]
        if source_platform:
            rows = [r for r in rows if r["source_platform"] == source_platform]
        return rows[offset : offset + limit]

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


def desktop_payload(title: str = "Desktop cap", platform: str = "claude") -> dict:
    return {
        "source": {
            "platform": platform,
            "url": "desktop",
            "browser_title": title,
            "captured_at": "2026-06-05T10:00:00.000Z",
        },
        "content": {
            "title": title,
            "messages": [{"role": "user", "content": "hello", "index": 0}],
        },
        "extraction_quality": {"confidence": 0.9, "method": "dom_attr", "warnings": [], "message_count": 1, "empty_message_count": 0},
        "hashes": {
            "content_hash": f"desktop-hash-{title}",
            "message_hashes": ["m1"],
            "source_fingerprint": f"desktop:{platform}:{title}",
        },
        "metadata": {},
    }


def test_list_captures_filter_source_side_browser():
    client = make_client()
    token = register(client, "side@example.com")

    client.post("/v1/captures", json=payload(title="Browser cap"), headers=auth(token))
    client.post("/v1/captures", json=desktop_payload(title="Desktop cap"), headers=auth(token))

    resp = client.get("/v1/captures?source_side=browser", headers=auth(token))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["source_url"] != "desktop"


def test_list_captures_filter_source_side_desktop():
    client = make_client()
    token = register(client, "desk@example.com")

    client.post("/v1/captures", json=payload(title="Browser cap"), headers=auth(token))
    client.post("/v1/captures", json=desktop_payload(title="Desktop cap"), headers=auth(token))

    resp = client.get("/v1/captures?source_side=desktop", headers=auth(token))
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["source_url"] == "desktop"


def test_list_captures_filter_source_platform():
    client = make_client()
    token = register(client, "plat@example.com")

    client.post("/v1/captures", json=payload(title="ChatGPT cap"), headers=auth(token))
    client.post("/v1/captures", json=desktop_payload(title="Claude cap", platform="claude"), headers=auth(token))

    resp = client.get("/v1/captures?source_platform=chatgpt", headers=auth(token))
    assert resp.status_code == 200
    assert all(r["source_platform"] == "chatgpt" for r in resp.json())


def test_list_captures_pagination():
    client = make_client()
    token = register(client, "page@example.com")

    for i in range(5):
        p = payload(title=f"Cap {i}", fingerprint=f"fp:{i}")
        p["hashes"]["content_hash"] = f"hash-pg-{i}"
        client.post("/v1/captures", json=p, headers=auth(token))

    page1 = client.get("/v1/captures?limit=2&offset=0", headers=auth(token))
    assert len(page1.json()) == 2

    page2 = client.get("/v1/captures?limit=2&offset=2", headers=auth(token))
    assert len(page2.json()) == 2

    last = client.get("/v1/captures?limit=2&offset=4", headers=auth(token))
    assert len(last.json()) == 1


def test_list_captures_limit_over_100_is_422():
    client = make_client()
    token = register(client, "lim@example.com")
    resp = client.get("/v1/captures?limit=101", headers=auth(token))
    assert resp.status_code == 422
