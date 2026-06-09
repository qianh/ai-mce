"""fix capture dedup key: use content_hash instead of source_fingerprint

Revision ID: 0002_fix_capture_dedup_key
Revises: 0001_initial
Create Date: 2026-06-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_fix_capture_dedup_key"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("uq_captures_user_source_fingerprint", table_name="captures")
    op.create_index(
        "uq_captures_user_content_hash",
        "captures",
        ["user_id", "content_hash"],
        unique=True,
        postgresql_where=sa.text("content_hash != ''"),
    )


def downgrade() -> None:
    op.drop_index("uq_captures_user_content_hash", table_name="captures")
    op.create_index(
        "uq_captures_user_source_fingerprint",
        "captures",
        ["user_id", "source_fingerprint"],
        unique=True,
        postgresql_where=sa.text("source_fingerprint != ''"),
    )
