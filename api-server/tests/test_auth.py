from fastapi.testclient import TestClient

from app.main import create_app


class FakeSupabaseClient:
    def __init__(self):
        self.users: dict[str, dict] = {}
        self.refresh_tokens: dict[str, str] = {}
        self.logged_out: list[str] = []

    def register(self, email: str, password: str) -> dict:
        if email in self.users:
            raise_supabase_error(409, "User already registered")
        user = {
            "id": "11111111-1111-1111-1111-111111111111",
            "email": email,
            "password_hash": f"hash:{password}",
        }
        self.users[email] = user
        return user

    def login(self, email: str, password: str) -> dict:
        row = self.users.get(email)
        if row is None or row["password_hash"] != f"hash:{password}":
            raise_supabase_error(401, "Invalid login credentials")
        return row

    def store_refresh_token(self, user_id: str, refresh_token: str, expires_at) -> None:
        self.refresh_tokens[refresh_token] = user_id

    def consume_refresh_token(self, refresh_token: str) -> dict | None:
        user_id = self.refresh_tokens.pop(refresh_token, None)
        if user_id is None:
            return None
        return next((user for user in self.users.values() if user["id"] == user_id), None)

    def logout(self, refresh_token: str) -> None:
        self.logged_out.append(refresh_token)
        self.refresh_tokens.pop(refresh_token, None)


def raise_supabase_error(status_code: int, message: str):
    from app.supabase_client import SupabaseApiError

    raise SupabaseApiError(status_code, message)


def make_client():
    return TestClient(create_app(supabase_client=FakeSupabaseClient()))


def test_register_returns_user_and_tokens():
    client = make_client()

    response = client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "me@example.com"
    assert body["access_token"]
    assert body["refresh_token"]


def test_duplicate_register_is_rejected():
    client = make_client()
    client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    response = client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    assert response.status_code == 409


def test_login_rejects_invalid_password():
    client = make_client()
    client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    response = client.post("/v1/auth/login", json={"email": "me@example.com", "password": "wrongpass"})

    assert response.status_code == 401


def test_login_maps_supabase_invalid_credentials_400_to_401():
    class Supabase400LoginClient(FakeSupabaseClient):
        def login(self, email: str, password: str) -> dict:
            raise_supabase_error(400, "Invalid login credentials")

    client = TestClient(create_app(supabase_client=Supabase400LoginClient()))

    response = client.post("/v1/auth/login", json={"email": "new@example.com", "password": "secret123"})

    assert response.status_code == 401


def test_register_maps_supabase_duplicate_400_to_409():
    class Supabase400DuplicateClient(FakeSupabaseClient):
        def register(self, email: str, password: str) -> dict:
            raise_supabase_error(400, "User already registered")

    client = TestClient(create_app(supabase_client=Supabase400DuplicateClient()))

    response = client.post("/v1/auth/register", json={"email": "me@example.com", "password": "secret123"})

    assert response.status_code == 409


def test_login_refresh_and_logout_token_lifecycle():
    client = make_client()
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
