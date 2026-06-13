from app.routes.captures import enqueue_digest


class _Worker:
    def __init__(self):
        self.enqueued = []

    def enqueue_nowait(self, cid):
        self.enqueued.append(cid)


def _request(worker):
    class _State:
        profile_worker = worker

    class _App:
        state = _State()

    class _Request:
        app = _App()

    return _Request()


def test_enqueue_digest_forwards_to_worker():
    worker = _Worker()
    enqueue_digest(_request(worker), "cap-1")
    assert worker.enqueued == ["cap-1"]


def test_enqueue_digest_noop_when_worker_absent():
    enqueue_digest(_request(None), "cap-1")  # 不抛异常即通过


def test_enqueue_digest_swallows_errors():
    class Boom:
        def enqueue_nowait(self, cid):
            raise RuntimeError("queue full")

    enqueue_digest(_request(Boom()), "cap-1")  # 不抛异常即通过
