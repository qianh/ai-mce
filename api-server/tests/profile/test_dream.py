from uuid import uuid4

from app.profile import models as pm
from app.profile.dream import run_dream_cycle
from tests.profile.test_segmenter import FakeLLM


class FakeEmbedder:
    def __init__(self, dim=4):
        self.dim = dim

    def embed(self, texts):
        return [[0.1] * self.dim for _ in texts]


def _atom(session, user_id, content="偏好结构化方案", dim="working_style",
          embedding=None, status="pending", confidence=0.8):
    atom = pm.MemoryAtom(user_id=user_id, capture_id=uuid4(), atom_type="preference",
                         dimension=dim, content=content, confidence=confidence,
                         status=status, embedding=embedding or [1.0, 0.0, 0.0, 0.0])
    session.add(atom)
    session.commit()
    return atom


def _claim(session, user_id, claim="用户偏好结构化方案", dim="working_style",
           embedding=None, status="active", confidence=0.5):
    row = pm.ProfileClaim(user_id=user_id, dimension=dim, claim=claim,
                          confidence=confidence, status=status,
                          embedding=embedding or [1.0, 0.0, 0.0, 0.0])
    session.add(row)
    session.commit()
    return row


def _link(session, claim, atom, status="active"):
    ev = pm.ClaimEvidence(claim_id=claim.id, atom_id=atom.id, polarity="supporting",
                          weight=1.0, status=status)
    session.add(ev)
    session.commit()
    return ev


def test_new_atom_creates_candidate_claim(db_session):
    uid = uuid4()
    atom = _atom(db_session, uid)
    run = run_dream_cycle(db_session, uid, FakeLLM([]), FakeEmbedder())
    assert run.status == "succeeded"
    claim = db_session.query(pm.ProfileClaim).one()
    assert claim.dimension == "working_style" and claim.status == "candidate"
    assert db_session.query(pm.ClaimEvidence).filter_by(claim_id=claim.id).count() == 1
    db_session.refresh(atom)
    assert atom.status == "fused"
    assert len(run.stats["changes"]["created"]) == 1


def test_supporting_existing_claim_strengthens(db_session):
    uid = uuid4()
    claim = _claim(db_session, uid, confidence=0.4)
    atom = _atom(db_session, uid)
    llm = FakeLLM([{"decisions": [
        {"atom_id": str(atom.id), "action": "attach", "claim_id": str(claim.id),
         "polarity": "supporting"}]}])
    run = run_dream_cycle(db_session, uid, llm, FakeEmbedder())
    db_session.refresh(claim)
    assert str(claim.id) in run.stats["changes"]["strengthened"]
    assert claim.confidence > 0.0
    assert db_session.query(pm.ClaimEvidence).filter_by(claim_id=claim.id, status="active").count() == 1


def test_superseded_evidence_deprecates_claim(db_session):
    uid = uuid4()
    claim = _claim(db_session, uid, confidence=0.7)
    atom = _atom(db_session, uid, status="superseded")
    _link(db_session, claim, atom)
    run = run_dream_cycle(db_session, uid, FakeLLM([]), FakeEmbedder())
    db_session.refresh(claim)
    assert claim.status == "deprecated"
    assert str(claim.id) in run.stats["changes"]["deprecated"]


def test_rejected_claim_is_not_revived(db_session):
    uid = uuid4()
    _claim(db_session, uid, status="user_rejected", embedding=[1.0, 0.0, 0.0, 0.0])
    _atom(db_session, uid, embedding=[1.0, 0.0, 0.0, 0.0])  # 语义等价
    run = run_dream_cycle(db_session, uid, FakeLLM([]), FakeEmbedder())
    # 不产生新 claim：只有那条 user_rejected
    assert db_session.query(pm.ProfileClaim).count() == 1
    assert run.stats["skipped_rejected_equivalents"] == 1


def test_same_day_second_run_is_noop(db_session):
    uid = uuid4()
    _atom(db_session, uid)
    run1 = run_dream_cycle(db_session, uid, FakeLLM([]), FakeEmbedder())
    run2 = run_dream_cycle(db_session, uid, FakeLLM([]), FakeEmbedder())
    assert run1.id == run2.id
    assert db_session.query(pm.DreamRun).count() == 1
