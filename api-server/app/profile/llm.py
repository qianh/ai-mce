import json

import httpx
from pydantic import BaseModel, ValidationError


class LLMError(RuntimeError):
    pass


class LLMClient:
    """OpenAI 兼容 /chat/completions 客户端；transport 注入供测试。"""

    def __init__(self, base_url: str, api_key: str, model: str,
                 transport: httpx.BaseTransport | None = None, timeout: float = 120.0):
        self.model = model
        self._http = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
            transport=transport,
        )

    def chat_json[T: BaseModel](self, system: str, user: str, response_model: type[T],
                                max_retries: int = 2, temperature: float = 0.1) -> T:
        last_error: Exception | None = None
        for _ in range(max_retries):
            resp = self._http.post("/chat/completions", json={
                "model": self.model,
                "temperature": temperature,
                "response_format": {"type": "json_object"},
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}],
            })
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            try:
                return response_model.model_validate(json.loads(content))
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc
        raise LLMError(f"LLM output failed validation after {max_retries} attempts") from last_error


class EmbeddingClient:
    """OpenAI 兼容 /embeddings 客户端（Ollama 的 /v1 端点同样适用）。"""

    def __init__(self, base_url: str, api_key: str, model: str, dim: int,
                 transport: httpx.BaseTransport | None = None, timeout: float = 60.0):
        self.model, self.dim = model, dim
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self._http = httpx.Client(base_url=base_url.rstrip("/"), headers=headers,
                                  timeout=timeout, transport=transport)

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        resp = self._http.post("/embeddings", json={"model": self.model, "input": texts})
        resp.raise_for_status()
        rows = sorted(resp.json()["data"], key=lambda d: d["index"])
        vectors = [row["embedding"] for row in rows]
        if any(len(v) != self.dim for v in vectors):
            raise LLMError(f"embedding dim mismatch, expected {self.dim}")
        return vectors
