import json
import os
from pathlib import Path

import httpx

DEFAULT_AUTH_PATH = Path.home() / ".mce" / "mcp-auth.json"


class ProfileApiError(RuntimeError):
    pass


class TokenStore:
    def __init__(self, path: Path = DEFAULT_AUTH_PATH):
        self._path = Path(path)

    def load(self) -> dict | None:
        try:
            return json.loads(self._path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None

    def save(self, tokens: dict) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._path.write_text(json.dumps(tokens))
        os.chmod(self._path, 0o600)


class ApiClient:
    """api-server 客户端：独立登录 + refresh 自动续期（spec: profile-mcp 独立认证）。"""

    def __init__(self, base_url: str, email: str, password: str,
                 store: TokenStore | None = None,
                 transport: httpx.BaseTransport | None = None, timeout: float = 30.0):
        self._email, self._password = email, password
        self._store = store or TokenStore()
        self._http = httpx.Client(base_url=base_url.rstrip("/"), timeout=timeout,
                                  transport=transport)

    # -- auth ---------------------------------------------------------------

    def _login(self) -> dict:
        resp = self._http.post("/v1/auth/login",
                               json={"email": self._email, "password": self._password})
        if resp.status_code != 200:
            raise ProfileApiError(f"login failed: {resp.status_code} {resp.text[:200]}")
        tokens = resp.json()
        self._store.save(tokens)
        return tokens

    def _refresh(self, refresh_token: str) -> dict | None:
        resp = self._http.post("/v1/auth/refresh", json={"refresh_token": refresh_token})
        if resp.status_code != 200:
            return None
        tokens = resp.json()
        self._store.save(tokens)
        return tokens

    def _tokens(self) -> dict:
        return self._store.load() or self._login()

    # -- request ------------------------------------------------------------

    def request(self, method: str, path: str, **kwargs) -> dict | list:
        tokens = self._tokens()
        resp = self._send(method, path, tokens["access_token"], **kwargs)
        if resp.status_code == 401:
            tokens = self._refresh(tokens.get("refresh_token", "")) or self._login()
            resp = self._send(method, path, tokens["access_token"], **kwargs)
        if resp.status_code >= 400:
            raise ProfileApiError(f"{method} {path} -> {resp.status_code} {resp.text[:200]}")
        return resp.json()

    def _send(self, method: str, path: str, access_token: str, **kwargs) -> httpx.Response:
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {access_token}"
        return self._http.request(method, path, headers=headers, **kwargs)
