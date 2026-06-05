from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())

    assert client.get("/health").json() == {"ok": True}
