from fastapi.testclient import TestClient

from app.main import create_app


def make_client(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'captures.db'}"
    return TestClient(create_app(database_url=db_url, create_schema=True))


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


def test_create_list_detail_and_no_ai_analysis(tmp_path):
    client = make_client(tmp_path)
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


def test_upsert_by_user_and_source_fingerprint(tmp_path):
    client = make_client(tmp_path)
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


def test_users_are_isolated_for_list_detail_and_delete(tmp_path):
    client = make_client(tmp_path)
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
