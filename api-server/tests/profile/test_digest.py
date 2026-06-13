from uuid import uuid4

from app.models import Capture, User
from app.profile import models as pm
from app.profile.digest import digest_capture
from tests.profile.test_segmenter import FakeLLM


class FakeEmbedder:
    def __init__(self, dim=4):
        self.dim = dim

    def embed(self, texts):
        return [[0.1] * self.dim for _ in texts]


def _make_capture(session, messages, content_hash="hash-1"):
    user = User(email=f"{uuid4()}@t.co", password_hash="x")
    session.add(user)
    session.flush()
    cap = Capture(user_id=user.id, source_platform="claude", source_url="desktop",
                  source_title="t", content_hash=content_hash, source_fingerprint="",
                  extraction_quality={}, messages=messages, metadata_json={},
                  message_count=len(messages))
    session.add(cap)
    session.commit()
    return cap


def _msgs(n, start=0):
    return [{"role": "user" if i % 2 == 0 else "assistant",
             "content": f"消息内容{i}", "index": i} for i in range(start, start + n)]


def _seg_resp(start, end, score=0.8):
    return {"segments": [{"start_index": start, "end_index": end, "title": "t",
                          "scenario": "planning", "summary": "s", "value_score": score}]}


def _atom_resp(start, end):
    return {"atoms": [{"atom_type": "preference", "dimension": "working_style",
                       "content": "偏好先规划后实现", "confidence": 0.8,
                       "evidence_start": start, "evidence_end": end}]}


def test_first_digest_creates_run_segments_atoms(db_session):
    cap = _make_capture(db_session, _msgs(4))
    llm = FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)])
    run = digest_capture(db_session, cap.id, llm, FakeEmbedder(), run_type="digest")
    assert run.status == "succeeded" and run.diff_type == "new"
    assert db_session.query(pm.TaskSegment).count() == 1
    atom = db_session.query(pm.MemoryAtom).one()
    assert atom.status == "pending" and atom.embedding == [0.1] * 4


def test_same_content_hash_is_idempotent(db_session):
    cap = _make_capture(db_session, _msgs(4))
    digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                   FakeEmbedder(), run_type="digest")
    run2 = digest_capture(db_session, cap.id, FakeLLM([]), FakeEmbedder(), run_type="digest")
    assert db_session.query(pm.MemoryAtom).count() == 1  # 原子数不变


def test_append_only_digests_only_new_range(db_session):
    cap = _make_capture(db_session, _msgs(4))
    digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                   FakeEmbedder(), run_type="digest")
    cap.messages = _msgs(8)
    cap.content_hash = "hash-2"
    db_session.commit()
    llm = FakeLLM([_seg_resp(4, 7), _atom_resp(4, 5)])
    run = digest_capture(db_session, cap.id, llm, FakeEmbedder(), run_type="digest")
    assert run.diff_type == "append_only"
    # 旧 segment 仍 active；新 segment 增加
    assert db_session.query(pm.TaskSegment).filter_by(status="active").count() == 2
    # LLM 只看到了带 buffer 的尾部，而不是全量 8 条
    assert "[0]" not in llm.prompts[0]


def test_failed_run_can_be_retried(db_session):
    """唯一约束不得阻断失败后的重试（spec: Digest 失败后续可补跑）。"""
    import pytest

    cap = _make_capture(db_session, _msgs(4))

    class BoomLLM:
        def chat_json(self, *a, **kw):
            raise RuntimeError("llm down")

    with pytest.raises(RuntimeError):
        digest_capture(db_session, cap.id, BoomLLM(), FakeEmbedder(), run_type="digest")
    assert db_session.query(pm.AnalysisRun).filter_by(status="failed").count() == 1

    run = digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                         FakeEmbedder(), run_type="digest")
    assert run.status == "succeeded"
    assert db_session.query(pm.AnalysisRun).count() == 1  # 复用同一行，不新增


def test_digest_accepts_string_capture_id(db_session):
    """入库钩子/backfill 传的是 str id，必须同样可用。"""
    cap = _make_capture(db_session, _msgs(4))
    run = digest_capture(db_session, str(cap.id), FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                         FakeEmbedder(), run_type="digest")
    assert run.status == "succeeded"


def test_modified_supersedes_old_artifacts(db_session):
    cap = _make_capture(db_session, _msgs(4))
    digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                   FakeEmbedder(), run_type="digest")
    changed = _msgs(4)
    changed[1]["content"] = "被修改的内容"
    cap.messages = changed
    cap.content_hash = "hash-3"
    db_session.commit()
    run = digest_capture(db_session, cap.id, FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                         FakeEmbedder(), run_type="digest")
    assert run.diff_type == "modified"
    assert db_session.query(pm.TaskSegment).filter_by(status="superseded").count() == 1
    assert db_session.query(pm.MemoryAtom).filter_by(status="superseded").count() == 1
    assert db_session.query(pm.MemoryAtom).filter_by(status="pending").count() == 1
