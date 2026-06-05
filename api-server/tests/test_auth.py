from fastapi.testclient import TestClient

from app.main import create_app


def make_client(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'auth.db'}"
    return TestClient(create_app(database_url=db_url, create_schema=True))


def test_register_returns_user_and_tokens(tmp_path):
    client = make_client(tmp_path)

    response = client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "me@example.com"
    assert body["access_token"]
    assert body["refresh_token"]


def test_duplicate_register_is_rejected(tmp_path):
    client = make_client(tmp_path)
    client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    response = client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    assert response.status_code == 409


def test_login_rejects_invalid_password(tmp_path):
    client = make_client(tmp_path)
    client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    response = client.post("/v1/auth/login", json={"email": "me@example.com", "password": "wrongpass"})

    assert response.status_code == 401


def test_login_refresh_and_logout_token_lifecycle(tmp_path):
    client = make_client(tmp_path)
    client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    login = client.post("/v1/auth/login", json={"email": "me@example.com", "password": "secret123"})
    assert login.status_code == 200
    refresh_token = login.json()["refresh_token"]

    refreshed = client.post("/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    new_refresh = refreshed.json()["refresh_token"]
    assert new_refresh != refresh_token

    logout = client.post("/v1/auth/logout", json={"refresh_token": new_refresh})
    assert logout.status_code == 204

    rejected = client.post("/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert rejected.status_code == 401
