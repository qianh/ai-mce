import json

import httpx
import pytest
from pydantic import BaseModel

from app.profile.llm import LLMClient, LLMError


class Echo(BaseModel):
    value: str


def _client(handler) -> LLMClient:
    return LLMClient(base_url="https://llm.test/v1", api_key="k", model="m",
                     transport=httpx.MockTransport(handler))


def _chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def test_chat_json_parses_into_model():
    def handler(request):
        body = json.loads(request.content)
        assert body["model"] == "m"
        assert body["response_format"] == {"type": "json_object"}
        return _chat_response('{"value": "ok"}')

    out = _client(handler).chat_json("sys", "user", Echo)
    assert out == Echo(value="ok")


def test_chat_json_retries_on_invalid_then_succeeds():
    calls = {"n": 0}

    def handler(request):
        calls["n"] += 1
        return _chat_response("not json" if calls["n"] == 1 else '{"value": "ok"}')

    out = _client(handler).chat_json("sys", "user", Echo, max_retries=2)
    assert out.value == "ok" and calls["n"] == 2


def test_chat_json_raises_after_exhausted_retries():
    def handler(request):
        return _chat_response("still not json")

    with pytest.raises(LLMError):
        _client(handler).chat_json("sys", "user", Echo, max_retries=2)


def test_embed_batches_and_validates_dim():
    from app.profile.llm import EmbeddingClient

    def handler(request):
        body = json.loads(request.content)
        return httpx.Response(200, json={"data": [
            {"index": i, "embedding": [0.5] * 4} for i in range(len(body["input"]))
        ]})

    client = EmbeddingClient(base_url="https://emb.test/v1", api_key="", model="bge-m3",
                             dim=4, transport=httpx.MockTransport(handler))
    out = client.embed(["a", "b"])
    assert len(out) == 2 and all(len(v) == 4 for v in out)


def test_embed_rejects_wrong_dim():
    from app.profile.llm import EmbeddingClient

    def handler(request):
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.5] * 3}]})

    client = EmbeddingClient(base_url="https://emb.test/v1", api_key="", model="bge-m3",
                             dim=4, transport=httpx.MockTransport(handler))
    with pytest.raises(LLMError):
        client.embed(["a"])
