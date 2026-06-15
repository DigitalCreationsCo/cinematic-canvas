"""Merge multiple heads.

Revision ID: 7db1179f2119
Revises: 0022_add_notification_feature_gate_and_pending_job, ad3cacfcd132
Create Date: 2026-06-13 14:11:59.176315

Phase: MIGRATE
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7db1179f2119"
down_revision: str | None = ("0022_add_notification_feature_gate_and_pending_job", "ad3cacfcd132")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()


def downgrade() -> None:
    conn = op.get_bind()
