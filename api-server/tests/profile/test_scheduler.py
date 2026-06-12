from uuid import uuid4

import pytest
from sqlalchemy.orm import sessionmaker

from app.profile import models as pm
from app.profile.scheduler import build_dream_trigger, find_dream_users, run_dream_for_all
from tests.profile.test_dream import FakeEmbedder, _atom
from tests.profile.test_segmenter import FakeLLM


def test_build_dream_trigger_parses_cron():
    trigger = build_dream_trigger("0 4 * * *")
    assert trigger is not None


def test_build_dream_trigger_rejects_invalid():
    with pytest.raises(ValueError):
        build_dream_trigger("not a cron")


def test_find_dream_users_returns_users_with_atoms(db_session):
    uid = uuid4()
    _atom(db_session, uid)
    assert find_dream_users(db_session) == [uid]


def test_run_dream_for_all_executes_cycles(engine, db_session):
    uid = uuid4()
    _atom(db_session, uid)
    factory = sessionmaker(bind=engine)
    count = run_dream_for_all(factory, FakeLLM([]), FakeEmbedder())
    assert count == 1
    with factory() as s:
        assert s.query(pm.DreamRun).filter_by(status="succeeded").count() == 1
