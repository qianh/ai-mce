"""add session_id to captures for session-level replace dedup

Precondition: no duplicate (user_id, source_platform, session_id) rows exist.
Existing rows get session_id = '' and are excluded by the partial index.

Revision ID: 0004_add_session_id
Revises: 0003_add_message_count
Create Date: 2026-06-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_add_session_id"
down_revision: str | None = "0003_add_message_count"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "captures",
        sa.Column("session_id", sa.Text(), nullable=False, server_default=""),
    )
    op.create_index(
        "uq_captures_user_platform_session",
        "captures",
        ["user_id", "source_platform", "session_id"],
        unique=True,
        postgresql_where=sa.text("session_id != ''"),
        sqlite_where=sa.text("session_id != ''"),
    )


def downgrade() -> None:
    op.drop_index("uq_captures_user_platform_session", table_name="captures")
    op.drop_column("captures", "session_id")
