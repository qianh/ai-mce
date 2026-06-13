from pydantic import BaseModel, Field

from app.profile.cleaning import CleanMessage
from app.profile.redact import redact

SCENARIOS = ("daily_qa", "coding", "debugging", "planning", "research",
             "writing", "decision", "project_management")
_CHUNK_SIZE = 60  # 规则预切：每块最多 60 条清洗后消息

_SYSTEM = """你是会话切分器。把 AI 对话按"任务目标"切成连续区间（Task Segment）。
规则：区间用消息 index 表示且不重叠不越界；scenario 取值 {scenarios}；
value_score ∈ [0,1] 衡量该段对刻画用户长期画像的价值；summary 用中文一句话。
只输出 JSON。""".format(scenarios="|".join(SCENARIOS))


class SegmentDraft(BaseModel):
    start_index: int
    end_index: int
    title: str
    scenario: str
    summary: str
    value_score: float = Field(ge=0, le=1)


class _SegmentList(BaseModel):
    segments: list[SegmentDraft]


def _render(messages: list[CleanMessage]) -> str:
    return "\n".join(f"[{m.index}] {m.role}: {redact(m.content)}" for m in messages)


def _validate(segments: list[SegmentDraft], messages: list[CleanMessage]) -> None:
    valid_indexes = {m.index for m in messages}
    prev_end = -1
    for seg in segments:
        if seg.start_index > seg.end_index or seg.start_index <= prev_end:
            raise ValueError(f"segment overlap/disorder: {seg}")
        if seg.start_index not in valid_indexes or seg.end_index not in valid_indexes:
            raise ValueError(f"segment out of range: {seg}")
        if seg.scenario not in SCENARIOS:
            raise ValueError(f"unknown scenario: {seg.scenario}")
        prev_end = seg.end_index


def split_segments(messages: list[CleanMessage], llm) -> list[SegmentDraft]:
    if not messages:
        return []
    result: list[SegmentDraft] = []
    for i in range(0, len(messages), _CHUNK_SIZE):
        chunk = messages[i:i + _CHUNK_SIZE]
        out = llm.chat_json(_SYSTEM, _render(chunk), _SegmentList)
        _validate(out.segments, chunk)
        result.extend(out.segments)
    return result
