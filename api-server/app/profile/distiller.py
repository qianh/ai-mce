from pydantic import BaseModel, Field

from app.profile.cleaning import CleanMessage
from app.profile.models import ATOM_TYPES, PROFILE_DIMENSIONS
from app.profile.redact import redact
from app.profile.segmenter import SegmentDraft

_SYSTEM = """你是记忆蒸馏器。从一个任务段中抽取关于"用户本人"的最小可证据化事实（Memory Atom）。
约束：
- atom_type ∈ {types}；dimension ∈ {dims}
- content 用中文、单句、描述可观察的行为/事实/偏好
- 红线：禁止心理、人格、能力高低判断（如"焦虑""不擅长"）；只描述行为模式
- evidence_start/evidence_end 为支撑该原子的消息 index 区间（必须落在给定消息内）
- confidence ∈ (0,1]；没有把握的内容宁可不抽
只输出 JSON。""".format(types="|".join(ATOM_TYPES), dims="|".join(PROFILE_DIMENSIONS))


class AtomDraft(BaseModel):
    atom_type: str
    dimension: str
    content: str
    confidence: float = Field(gt=0, le=1)
    evidence_start: int
    evidence_end: int


class _AtomList(BaseModel):
    atoms: list[AtomDraft]


def distill_segment(segment: SegmentDraft, messages: list[CleanMessage], llm,
                    value_threshold: float = 0.3) -> list[AtomDraft]:
    if segment.value_score < value_threshold:
        return []
    in_range = [m for m in messages if segment.start_index <= m.index <= segment.end_index]
    prompt = (f"任务段：{segment.title}（{segment.scenario}）\n摘要：{segment.summary}\n\n"
              + "\n".join(f"[{m.index}] {m.role}: {redact(m.content)}" for m in in_range))
    out = llm.chat_json(_SYSTEM, prompt, _AtomList)
    valid = {m.index for m in in_range}
    for atom in out.atoms:
        if atom.atom_type not in ATOM_TYPES or atom.dimension not in PROFILE_DIMENSIONS:
            raise ValueError(f"invalid atom enums: {atom}")
        if atom.evidence_start not in valid or atom.evidence_end not in valid \
                or atom.evidence_start > atom.evidence_end:
            raise ValueError(f"invalid evidence range: {atom}")
    return out.atoms
