"""add message_count column to captures

Revision ID: 0003_add_message_count
Revises: 0002_fix_capture_dedup_key
Create Date: 2026-06-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_add_message_count"
down_revision: str | None = "0002_fix_capture_dedup_key"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("captures", sa.Column("message_count", sa.Integer(), nullable=True))
    # Backfill from existing JSON messages.
    # json_array_length works on both Postgres (json type) and SQLite (JSON1).
    op.execute("UPDATE captures SET message_count = json_array_length(messages)")
    # Now make it NOT NULL with a default
    op.alter_column("captures", "message_count", nullable=False, server_default=sa.text("0"))


def downgrade() -> None:
    op.drop_column("captures", "message_count")
