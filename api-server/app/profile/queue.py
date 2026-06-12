import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models import Capture
from app.profile import models as pm
from app.profile.digest import digest_capture

logger = logging.getLogger(__name__)


class ProfileWorker:
    def __init__(self, session_factory: sessionmaker[Session], llm, embedder,
                 value_threshold: float = 0.3):
        self._factory = session_factory
        self._llm, self._embedder = llm, embedder
        self._threshold = value_threshold
        self._queue: asyncio.Queue[UUID] = asyncio.Queue()
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._consume())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def enqueue(self, capture_id: UUID) -> None:
        await self._queue.put(capture_id)

    def enqueue_nowait(self, capture_id: UUID) -> None:
        self._queue.put_nowait(capture_id)

    async def drain(self) -> None:
        await self._queue.join()

    async def reconcile(self) -> int:
        """启动对账：最新内容没有成功 Analysis Run 的 capture 全部入队。"""

        def _find() -> list[UUID]:
            with self._factory() as session:
                done = (
                    select(pm.AnalysisRun.id)
                    .where(pm.AnalysisRun.status == "succeeded",
                           pm.AnalysisRun.capture_id == Capture.id,
                           pm.AnalysisRun.content_hash == Capture.content_hash)
                    .exists()
                )
                return list(session.execute(select(Capture.id).where(~done)).scalars().all())

        ids = await asyncio.to_thread(_find)
        for cid in ids:
            await self.enqueue(cid)
        return len(ids)

    async def _consume(self) -> None:
        while True:
            capture_id = await self._queue.get()
            try:
                await asyncio.to_thread(self._digest_one, capture_id)
            except Exception:
                logger.exception("digest failed for capture %s", capture_id)
            finally:
                self._queue.task_done()

    def _digest_one(self, capture_id: UUID) -> None:
        with self._factory() as session:
            digest_capture(session, capture_id, self._llm, self._embedder,
                           value_threshold=self._threshold)
