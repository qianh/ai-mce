import json

import httpx

from mcp_server.api_client import ApiClient, TokenStore


def _store(tmp_path):
    return TokenStore(path=tmp_path / "auth.json")


def test_token_store_roundtrip(tmp_path):
    store = _store(tmp_path)
    assert store.load() is None
    store.save({"access_token": "a", "refresh_token": "r"})
    assert store.load() == {"access_token": "a", "refresh_token": "r"}
    assert oct((tmp_path / "auth.json").stat().st_mode & 0o777) == "0o600"


def test_login_then_authorized_request(tmp_path):
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.url.path, request.headers.get("authorization")))
        if request.url.path == "/v1/auth/login":
            return httpx.Response(200, json={"access_token": "at1", "refresh_token": "rt1"})
        return httpx.Response(200, json={"content": "ok"})

    client = ApiClient(base_url="https://api.test", email="e@t.co", password="p",
                       store=_store(tmp_path), transport=httpx.MockTransport(handler))
    body = client.request("GET", "/v1/profile/brief")
    assert body == {"content": "ok"}
    assert ("/v1/auth/login", None) in calls
    assert ("/v1/profile/brief", "Bearer at1") in calls


def test_401_triggers_refresh_and_retry(tmp_path):
    store = _store(tmp_path)
    store.save({"access_token": "expired", "refresh_token": "rt1"})
    seen = {"brief": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v1/auth/refresh":
            assert json.loads(request.content)["refresh_token"] == "rt1"
            return httpx.Response(200, json={"access_token": "at2", "refresh_token": "rt2"})
        if request.url.path == "/v1/profile/brief":
            seen["brief"] += 1
            auth = request.headers.get("authorization")
            if auth == "Bearer expired":
                return httpx.Response(401, json={"detail": "expired"})
            return httpx.Response(200, json={"content": "fresh"})
        raise AssertionError(request.url.path)

    client = ApiClient(base_url="https://api.test", email="e@t.co", password="p",
                       store=store, transport=httpx.MockTransport(handler))
    assert client.request("GET", "/v1/profile/brief") == {"content": "fresh"}
    assert seen["brief"] == 2
    assert store.load()["access_token"] == "at2"


def test_refresh_failure_falls_back_to_login(tmp_path):
    store = _store(tmp_path)
    store.save({"access_token": "expired", "refresh_token": "dead"})

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/v1/auth/refresh":
            return httpx.Response(401, json={"detail": "revoked"})
        if path == "/v1/auth/login":
            return httpx.Response(200, json={"access_token": "at3", "refresh_token": "rt3"})
        auth = request.headers.get("authorization")
        if auth == "Bearer at3":
            return httpx.Response(200, json={"content": "relogin"})
        return httpx.Response(401, json={"detail": "expired"})

    client = ApiClient(base_url="https://api.test", email="e@t.co", password="p",
                       store=store, transport=httpx.MockTransport(handler))
    assert client.request("GET", "/v1/profile/brief") == {"content": "relogin"}
