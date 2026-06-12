from uuid import uuid4

from app.profile import models as pm
from app.profile.brief import compile_brief, create_snapshot
from app.profile.dream import run_dream_cycle
from tests.profile.test_dream import FakeEmbedder, _claim
from tests.profile.test_segmenter import FakeLLM


def test_compile_brief_includes_only_qualified_claims(db_session):
    uid = uuid4()
    _claim(db_session, uid, claim="高置信工作方式", dim="working_style",
           status="active", confidence=0.8)
    _claim(db_session, uid, claim="用户确认的语言偏好", dim="language_style",
           status="user_confirmed", confidence=0.95)
    _claim(db_session, uid, claim="低置信内容", dim="working_style",
           status="active", confidence=0.2)
    _claim(db_session, uid, claim="被否定内容", dim="working_style",
           status="user_rejected", confidence=0.9)
    _claim(db_session, uid, claim="已废弃内容", dim="working_style",
           status="deprecated", confidence=0.9)
    brief = compile_brief(db_session, uid)
    assert "高置信工作方式" in brief.content
    assert "用户确认的语言偏好" in brief.content
    assert "低置信内容" not in brief.content
    assert "被否定内容" not in brief.content
    assert "已废弃内容" not in brief.content
    assert len(brief.source_claim_ids) == 2
    assert brief.version == 1


def test_compile_brief_versions_increment_and_truncate(db_session):
    uid = uuid4()
    for i in range(50):
        _claim(db_session, uid, claim=f"长断言{'内容' * 60}-{i}", dim="skill_signal",
               status="active", confidence=0.9)
    b1 = compile_brief(db_session, uid)
    b2 = compile_brief(db_session, uid)
    assert b2.version == b1.version + 1
    assert len(b1.content) <= 2000


def test_create_snapshot_versions(db_session):
    uid = uuid4()
    run = pm.DreamRun(user_id=uid, status="succeeded")
    db_session.add(run)
    db_session.commit()
    s1 = create_snapshot(db_session, uid, run, {"created": []})
    s2 = create_snapshot(db_session, uid, run, {"created": ["x"]})
    assert s2.version == s1.version + 1
    assert s2.changes == {"created": ["x"]}


def test_dream_cycle_produces_snapshot_and_brief(db_session):
    uid = uuid4()
    from tests.profile.test_dream import _atom
    _atom(db_session, uid, content="偏好结构化方案", confidence=0.9)
    run_dream_cycle(db_session, uid, FakeLLM([]), FakeEmbedder())
    assert db_session.query(pm.ProfileSnapshot).count() == 1
    assert db_session.query(pm.UserBrief).count() == 1
