from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Capture
from app.profile import models as pm
from app.profile.cleaning import clean_messages
from app.profile.diff import compute_message_hashes, diff_hashes
from app.profile.distiller import distill_segment
from app.profile.segmenter import split_segments

PIPELINE_VERSION = "v1"
# append_only 时向前多带的消息条数。按消息数而非旧 segment 起点取 buffer：
# 旧 segment 可能覆盖整条会话，按其起点会退化成全量重消化。
_CONTEXT_BUFFER_MESSAGES = 2


def _last_successful_run(session: Session, capture_id: UUID) -> pm.AnalysisRun | None:
    return session.execute(
        select(pm.AnalysisRun)
        .where(pm.AnalysisRun.capture_id == capture_id, pm.AnalysisRun.status == "succeeded")
        .order_by(pm.AnalysisRun.created_at.desc(), pm.AnalysisRun.started_at.desc())
        .limit(1)
    ).scalars().first()


def _supersede_all(session: Session, capture_id: UUID) -> None:
    for seg in session.execute(select(pm.TaskSegment).where(
            pm.TaskSegment.capture_id == capture_id,
            pm.TaskSegment.status == "active")).scalars():
        seg.status = "superseded"
    for atom in session.execute(select(pm.MemoryAtom).where(
            pm.MemoryAtom.capture_id == capture_id,
            pm.MemoryAtom.status.in_(("pending", "fused")))).scalars():
        atom.status = "superseded"


def digest_capture(session: Session, capture_id: UUID | str, llm, embedder,
                   run_type: str = "digest", value_threshold: float = 0.3,
                   pipeline_version: str = PIPELINE_VERSION) -> pm.AnalysisRun:
    if not isinstance(capture_id, UUID):
        capture_id = UUID(str(capture_id))

    capture = session.get(Capture, capture_id)
    if capture is None:
        raise ValueError(f"capture {capture_id} not found")

    # 幂等：同 (capture, content_hash, pipeline) 已成功 → 直接返回
    existing = session.execute(
        select(pm.AnalysisRun).where(
            pm.AnalysisRun.capture_id == capture_id,
            pm.AnalysisRun.content_hash == capture.content_hash,
            pm.AnalysisRun.pipeline_version == pipeline_version,
            pm.AnalysisRun.status == "succeeded")
    ).scalars().first()
    if existing is not None:
        return existing

    new_hashes = compute_message_hashes(capture.messages)
    last = _last_successful_run(session, capture_id)
    diff = diff_hashes(last.message_hashes if last else None, new_hashes)

    # 失败的 run 可以重试：复用同一行（upsert 语义），避免 UniqueConstraint 冲突
    failed = session.execute(
        select(pm.AnalysisRun).where(
            pm.AnalysisRun.capture_id == capture_id,
            pm.AnalysisRun.content_hash == capture.content_hash,
            pm.AnalysisRun.pipeline_version == pipeline_version,
            pm.AnalysisRun.status == "failed")
    ).scalars().first()

    if failed is not None:
        run = failed
        run.run_type = run_type
        run.diff_type = diff.diff_type
        run.message_hashes = new_hashes
        run.status = "running"
        run.error = None
        run.started_at = datetime.now(timezone.utc)
        run.finished_at = None
    else:
        run = pm.AnalysisRun(user_id=capture.user_id, capture_id=capture_id,
                             content_hash=capture.content_hash, pipeline_version=pipeline_version,
                             run_type=run_type, diff_type=diff.diff_type,
                             message_hashes=new_hashes, status="running",
                             started_at=datetime.now(timezone.utc))
        session.add(run)
    session.flush()

    try:
        if diff.diff_type == "noop":
            run.status, run.finished_at = "succeeded", datetime.now(timezone.utc)
            session.commit()
            return run

        if diff.diff_type == "modified":
            _supersede_all(session, capture_id)
            window_start = 0
        elif diff.diff_type == "append_only":
            window_start = max(diff.new_start - _CONTEXT_BUFFER_MESSAGES, 0)
        else:  # new
            window_start = 0

        cleaned = [m for m in clean_messages(capture.messages) if m.index >= window_start]
        run.digested_range = {"start": window_start, "end": len(capture.messages) - 1}

        segments = split_segments(cleaned, llm)
        for draft in segments:
            seg_row = pm.TaskSegment(user_id=capture.user_id, capture_id=capture_id,
                                     analysis_run_id=run.id, start_index=draft.start_index,
                                     end_index=draft.end_index, title=draft.title,
                                     scenario=draft.scenario, summary=draft.summary,
                                     value_score=draft.value_score)
            session.add(seg_row)
            session.flush()
            atoms = distill_segment(draft, cleaned, llm, value_threshold=value_threshold)
            texts = [a.content for a in atoms]
            vectors = embedder.embed(texts) if texts else []
            for atom, vec in zip(atoms, vectors):
                session.add(pm.MemoryAtom(
                    user_id=capture.user_id, segment_id=seg_row.id, capture_id=capture_id,
                    atom_type=atom.atom_type, dimension=atom.dimension, content=atom.content,
                    confidence=atom.confidence, evidence_start=atom.evidence_start,
                    evidence_end=atom.evidence_end, status="pending", embedding=vec))
            seg_vec = embedder.embed([f"{draft.title}\n{draft.summary}"])
            seg_row.embedding = seg_vec[0]

        run.status, run.finished_at = "succeeded", datetime.now(timezone.utc)
        session.commit()
        return run
    except Exception as exc:
        session.rollback()
        run = session.merge(run)
        run.status, run.error = "failed", str(exc)[:2000]
        run.finished_at = datetime.now(timezone.utc)
        session.commit()
        raise
