import pytest

from app.profile.cleaning import CleanMessage
from app.profile.segmenter import split_segments


class FakeLLM:
    """duck-type LLMClient.chat_json；记录 prompt 供脱敏断言。"""

    def __init__(self, responses):
        self.responses, self.prompts = list(responses), []

    def chat_json(self, system, user, response_model, **kw):
        self.prompts.append(user)
        return response_model.model_validate(self.responses.pop(0))


def _msgs(n, prefix="msg"):
    return [CleanMessage(index=i, role="user" if i % 2 == 0 else "assistant",
                         content=f"{prefix}{i}") for i in range(n)]


def test_split_returns_validated_segments():
    llm = FakeLLM([{"segments": [
        {"start_index": 0, "end_index": 3, "title": "架构讨论", "scenario": "planning",
         "summary": "讨论了画像系统架构", "value_score": 0.8},
        {"start_index": 4, "end_index": 7, "title": "bug 排查", "scenario": "debugging",
         "summary": "排查并发问题", "value_score": 0.7},
    ]}])
    out = split_segments(_msgs(8), llm)
    assert [s.title for s in out] == ["架构讨论", "bug 排查"]
    assert out[0].end_index < out[1].start_index


def test_split_rejects_out_of_range_or_overlap():
    llm = FakeLLM([{"segments": [
        {"start_index": 0, "end_index": 99, "title": "x", "scenario": "planning",
         "summary": "s", "value_score": 0.5}]}])
    with pytest.raises(ValueError):
        split_segments(_msgs(4), llm)


def test_prompt_is_redacted():
    llm = FakeLLM([{"segments": [
        {"start_index": 0, "end_index": 1, "title": "x", "scenario": "coding",
         "summary": "s", "value_score": 0.5}]}])
    msgs = [CleanMessage(index=0, role="user", content="key sk-abc123DEF456ghi789jkl"),
            CleanMessage(index=1, role="assistant", content="ok")]
    split_segments(msgs, llm)
    assert "sk-abc123DEF456ghi789jkl" not in llm.prompts[0]
