import pytest

from app.profile.cleaning import CleanMessage
from app.profile.distiller import distill_segment
from app.profile.segmenter import SegmentDraft
from tests.profile.test_segmenter import FakeLLM


def _seg(start=0, end=3, score=0.8):
    return SegmentDraft(start_index=start, end_index=end, title="t",
                        scenario="planning", summary="s", value_score=score)


def _msgs():
    return [CleanMessage(index=i, role="user" if i % 2 == 0 else "assistant",
                         content=f"c{i}") for i in range(4)]


def test_distill_returns_atoms_with_evidence_range():
    llm = FakeLLM([{"atoms": [
        {"atom_type": "preference", "dimension": "language_style",
         "content": "要求所有回复使用中文", "confidence": 0.9,
         "evidence_start": 0, "evidence_end": 1},
    ]}])
    atoms = distill_segment(_seg(), _msgs(), llm)
    assert atoms[0].dimension == "language_style"
    assert 0 <= atoms[0].evidence_start <= atoms[0].evidence_end <= 3


def test_distill_skips_low_value_segment():
    llm = FakeLLM([])  # 不应被调用
    assert distill_segment(_seg(score=0.1), _msgs(), llm, value_threshold=0.3) == []


def test_distill_rejects_bad_dimension():
    llm = FakeLLM([{"atoms": [
        {"atom_type": "fact", "dimension": "personality",  # 非法维度
         "content": "x", "confidence": 0.5, "evidence_start": 0, "evidence_end": 0},
    ]}])
    with pytest.raises(ValueError):
        distill_segment(_seg(), _msgs(), llm)
