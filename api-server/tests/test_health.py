from fastapi.testclient import TestClient

from app.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())

    assert client.get("/health").json() == {"ok": True}


def test_cors_preflight_allows_extension_auth_requests():
    client = TestClient(create_app())

    response = client.options(
        "/v1/auth/login",
        headers={
            "Origin": "chrome-extension://test-extension-id",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "chrome-extension://test-extension-id"
    assert "POST" in response.headers["access-control-allow-methods"]
