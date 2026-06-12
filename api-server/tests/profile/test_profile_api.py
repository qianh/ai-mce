from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.main import create_app
from app.profile import models as pm
from app.routes.captures import current_user_id
from app.routes.profile import get_db_session
from tests.profile.test_digest import _make_capture, _msgs
from tests.profile.test_dream import FakeEmbedder, _atom, _claim, _link


class _FakeWorker:
    def __init__(self):
        self.embedder = FakeEmbedder()
        self.enqueued = []

    async def start(self):
        pass

    async def stop(self):
        pass

    async def reconcile(self):
        return 0

    def enqueue_nowait(self, cid):
        self.enqueued.append(cid)


@pytest.fixture()
def api(engine, db_session):
    uid = uuid4()
    worker = _FakeWorker()
    app = create_app(profile_worker=worker)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def _get_db():
        with factory() as s:
            yield s

    app.dependency_overrides[get_db_session] = _get_db
    app.dependency_overrides[current_user_id] = lambda: str(uid)
    with TestClient(app) as client:
        yield client, uid, worker, db_session


def test_brief_404_then_200(api):
    client, uid, _, session = api
    assert client.get("/v1/profile/brief").status_code == 404
    session.add(pm.UserBrief(user_id=uid, version=1, content="# 用户简报",
                             source_claim_ids=[]))
    session.commit()
    body = client.get("/v1/profile/brief").json()
    assert body["content"] == "# 用户简报" and body["version"] == 1


def test_claims_filters_and_semantic_order(api):
    client, uid, _, session = api
    near = _claim(session, uid, claim="近的", embedding=[0.1, 0.1, 0.1, 0.1])
    far = _claim(session, uid, claim="远的", embedding=[1.0, -1.0, 1.0, -1.0])
    _claim(session, uid, claim="被否定", status="user_rejected")
    _claim(session, uid, claim="已废弃", status="deprecated")
    rows = client.get("/v1/profile/claims").json()
    assert {r["claim"] for r in rows} == {"近的", "远的"}  # 默认排除两种状态
    rows = client.get("/v1/profile/claims", params={"q": "随便查点什么"}).json()
    assert rows[0]["claim"] == "近的"  # FakeEmbedder 返回 [0.1]*4，与 near 同向


def test_claim_evidence_chain(api):
    client, uid, _, session = api
    cap = _make_capture(session, _msgs(4))
    claim = _claim(session, uid)
    atom = _atom(session, uid)
    atom.capture_id = cap.id
    atom.evidence_start, atom.evidence_end = 0, 1
    session.commit()
    _link(session, claim, atom)
    rows = client.get(f"/v1/profile/claims/{claim.id}/evidence").json()
    assert rows[0]["atom_content"] == atom.content
    assert rows[0]["capture_title"] == "t"
    assert rows[0]["evidence_range"] == [0, 1]
    assert rows[0]["status"] == "active"


def test_calibration_reject_takes_effect_immediately(api):
    client, uid, _, session = api
    claim = _claim(session, uid, claim="错误结论", confidence=0.9)
    resp = client.post("/v1/profile/calibrations",
                       json={"claim_id": str(claim.id), "action": "reject"})
    assert resp.status_code == 200
    session.refresh(claim)
    assert claim.status == "user_rejected"
    rows = client.get("/v1/profile/claims").json()
    assert all(r["id"] != str(claim.id) for r in rows)
    assert session.query(pm.Calibration).filter_by(action="reject").count() == 1


def test_calibration_correct_requires_text(api):
    client, uid, _, session = api
    claim = _claim(session, uid)
    resp = client.post("/v1/profile/calibrations",
                       json={"claim_id": str(claim.id), "action": "correct"})
    assert resp.status_code == 422


def test_dreams_latest(api):
    client, uid, _, session = api
    session.add(pm.DreamRun(user_id=uid, status="succeeded",
                            started_at=datetime.now(timezone.utc),
                            stats={"changes": {"created": ["x"]}}))
    session.commit()
    body = client.get("/v1/profile/dreams/latest").json()
    assert body["stats"]["changes"]["created"] == ["x"]


def test_backfill_enqueues_recent_captures(api):
    client, uid, worker, session = api
    cap = _make_capture(session, _msgs(4))
    # 把 capture 归到当前认证用户名下
    cap.user_id = uid
    session.commit()
    body = client.post("/v1/profile/backfill", json={"days": 90}).json()
    assert body["enqueued"] == 1
    assert worker.enqueued == [str(cap.id)]
