from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.profile import models as pm


def test_all_profile_tables_create_on_sqlite(engine):
    from app.models import Base

    names = set(Base.metadata.tables)
    assert {
        "analysis_runs", "task_segments", "memory_atoms", "profile_claims",
        "claim_evidence", "dream_runs", "profile_snapshots", "user_briefs", "calibrations",
    } <= names


def test_analysis_run_idempotency_unique(db_session):
    uid, cid = uuid4(), uuid4()
    db_session.add(pm.AnalysisRun(user_id=uid, capture_id=cid, content_hash="h1",
                                  pipeline_version="v1", run_type="digest", status="succeeded"))
    db_session.commit()
    db_session.add(pm.AnalysisRun(user_id=uid, capture_id=cid, content_hash="h1",
                                  pipeline_version="v1", run_type="digest", status="queued"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_memory_atom_roundtrip_with_embedding(db_session):
    uid = uuid4()
    atom = pm.MemoryAtom(user_id=uid, capture_id=uuid4(), segment_id=None,
                         atom_type="preference", dimension="language_style",
                         content="回复必须使用中文", confidence=0.9,
                         status="pending", embedding=[0.1] * 4)
    db_session.add(atom)
    db_session.commit()
    got = db_session.get(pm.MemoryAtom, atom.id)
    assert got.embedding == [0.1] * 4 and got.status == "pending"
