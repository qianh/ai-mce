"""profile-analysis: 9 analysis-layer tables + pgvector

Revision ID: 0005_profile_tables
Revises: 0004_add_session_id
Create Date: 2026-06-12
"""

from collections.abc import Sequence

from alembic import op

from app.profile.models import (
    AnalysisRun,
    Calibration,
    ClaimEvidence,
    DreamRun,
    MemoryAtom,
    ProfileClaim,
    ProfileSnapshot,
    TaskSegment,
    UserBrief,
)

revision: str = "0005_profile_tables"
down_revision: str | None = "0004_add_session_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [AnalysisRun, TaskSegment, MemoryAtom, ProfileClaim, ClaimEvidence,
           DreamRun, ProfileSnapshot, UserBrief, Calibration]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    for model in _TABLES:
        model.__table__.create(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for model in reversed(_TABLES):
        model.__table__.drop(bind, checkfirst=True)
