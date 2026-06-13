from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON, Uuid

from app.models import Base

EMBEDDING_DIM = 1024  # 必须与 MCE_EMBEDDING_DIM 及迁移 0005 一致（Gate 2: bge-m3）

PROFILE_DIMENSIONS = ("basic_info", "project_context", "working_style", "language_style",
                      "problem_solving", "skill_signal", "ai_usage")
ATOM_TYPES = ("fact", "preference", "skill_signal", "project_context", "behavior_pattern")


class EmbeddingVector(TypeDecorator):
    """Postgres 用 pgvector，其他方言（sqlite 测试）退化为 JSON。"""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            from pgvector.sqlalchemy import Vector

            return dialect.type_descriptor(Vector(EMBEDDING_DIM))
        return dialect.type_descriptor(JSON())


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    __table_args__ = (
        UniqueConstraint("capture_id", "content_hash", "pipeline_version",
                         name="uq_analysis_runs_idempotency"),
        Index("ix_analysis_runs_capture", "capture_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    capture_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    pipeline_version: Mapped[str] = mapped_column(String(32), nullable=False)
    run_type: Mapped[str] = mapped_column(String(16), nullable=False)   # digest|redigest|backfill
    diff_type: Mapped[str | None] = mapped_column(String(16))           # new|append_only|modified|noop
    message_hashes: Mapped[list | None] = mapped_column(JSON)
    digested_range: Mapped[dict | None] = mapped_column(JSON)           # {"start": int, "end": int}
    status: Mapped[str] = mapped_column(String(16), nullable=False)     # queued|running|succeeded|failed
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class TaskSegment(Base):
    __tablename__ = "task_segments"
    __table_args__ = (Index("ix_task_segments_capture_status", "capture_id", "status"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    capture_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    analysis_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("analysis_runs.id", ondelete="CASCADE"), nullable=False)
    start_index: Mapped[int] = mapped_column(Integer, nullable=False)
    end_index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    scenario: Mapped[str] = mapped_column(String(32), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    value_score: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active|superseded
    supersedes_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True))
    embedding: Mapped[list | None] = mapped_column(EmbeddingVector())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class MemoryAtom(Base):
    __tablename__ = "memory_atoms"
    __table_args__ = (Index("ix_memory_atoms_status", "user_id", "status"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    segment_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("task_segments.id", ondelete="SET NULL"))
    capture_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    atom_type: Mapped[str] = mapped_column(String(32), nullable=False)
    dimension: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    evidence_start: Mapped[int | None] = mapped_column(Integer)
    evidence_end: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    # pending|fused|superseded|rejected
    embedding: Mapped[list | None] = mapped_column(EmbeddingVector())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    fused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProfileClaim(Base):
    __tablename__ = "profile_claims"
    __table_args__ = (Index("ix_profile_claims_user_status", "user_id", "status"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dimension: Mapped[str] = mapped_column(String(32), nullable=False)
    project_key: Mapped[str | None] = mapped_column(Text)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="candidate")
    # candidate|active|user_confirmed|weakened|deprecated|user_rejected
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    embedding: Mapped[list | None] = mapped_column(EmbeddingVector())
    last_reconciled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ClaimEvidence(Base):
    __tablename__ = "claim_evidence"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    claim_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("profile_claims.id", ondelete="CASCADE"), nullable=False)
    atom_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("memory_atoms.id", ondelete="CASCADE"), nullable=False)
    polarity: Mapped[str] = mapped_column(String(16), nullable=False)   # supporting|contradicting
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")  # active|superseded
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class DreamRun(Base):
    __tablename__ = "dream_runs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)     # running|succeeded|failed
    stats: Mapped[dict | None] = mapped_column(JSON)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ProfileSnapshot(Base):
    __tablename__ = "profile_snapshots"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    dream_run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("dream_runs.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    changes: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserBrief(Base):
    __tablename__ = "user_briefs"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    source_claim_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Calibration(Base):
    __tablename__ = "calibrations"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    claim_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("profile_claims.id", ondelete="CASCADE"), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)     # confirm|reject|correct
    corrected_text: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
