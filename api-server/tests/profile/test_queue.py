import pytest
from sqlalchemy.orm import sessionmaker

from app.profile import models as pm
from app.profile.queue import ProfileWorker
from tests.profile.test_digest import FakeEmbedder, _atom_resp, _make_capture, _msgs, _seg_resp
from tests.profile.test_segmenter import FakeLLM


@pytest.mark.anyio
async def test_worker_digests_enqueued_capture(engine, db_session):
    cap = _make_capture(db_session, _msgs(4))
    factory = sessionmaker(bind=engine)
    worker = ProfileWorker(session_factory=factory,
                           llm=FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                           embedder=FakeEmbedder())
    await worker.start()
    await worker.enqueue(cap.id)
    await worker.drain()
    await worker.stop()
    with factory() as s:
        assert s.query(pm.AnalysisRun).filter_by(status="succeeded").count() == 1


@pytest.mark.anyio
async def test_reconcile_enqueues_unprocessed_captures(engine, db_session):
    _make_capture(db_session, _msgs(4))
    factory = sessionmaker(bind=engine)
    worker = ProfileWorker(session_factory=factory,
                           llm=FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)]),
                           embedder=FakeEmbedder())
    await worker.start()
    enqueued = await worker.reconcile()
    assert enqueued == 1
    await worker.drain()
    await worker.stop()
    with factory() as s:
        assert s.query(pm.AnalysisRun).filter_by(status="succeeded").count() == 1


@pytest.mark.anyio
async def test_digest_failure_does_not_kill_worker(engine, db_session):
    cap1 = _make_capture(db_session, _msgs(4))
    cap2 = _make_capture(db_session, _msgs(4), content_hash="hash-x")
    factory = sessionmaker(bind=engine)

    class ExplodingLLM:
        def __init__(self):
            self.inner = FakeLLM([_seg_resp(0, 3), _atom_resp(0, 1)])
            self.first = True

        def chat_json(self, *a, **kw):
            if self.first:
                self.first = False
                raise RuntimeError("llm down")
            return self.inner.chat_json(*a, **kw)

    worker = ProfileWorker(session_factory=factory, llm=ExplodingLLM(), embedder=FakeEmbedder())
    await worker.start()
    await worker.enqueue(cap1.id)
    await worker.enqueue(cap2.id)
    await worker.drain()
    await worker.stop()
    with factory() as s:
        assert s.query(pm.AnalysisRun).filter_by(status="failed").count() == 1
        assert s.query(pm.AnalysisRun).filter_by(status="succeeded").count() == 1
