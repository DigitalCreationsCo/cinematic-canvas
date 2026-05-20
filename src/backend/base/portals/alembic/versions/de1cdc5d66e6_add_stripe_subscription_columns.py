"""add_stripe_subscription_columns

Revision ID: de1cdc5d66e6
Revises: a382dc96dcc3
Create Date: 2026-05-20 12:00:00.000000

Phase: EXPAND
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from portals.utils import migration

revision: str = "de1cdc5d66e6"
down_revision: str | None = "a382dc96dcc3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    with op.batch_alter_table("user", schema=None) as batch_op:
        if not migration.column_exists("user", "stripe_customer_id", conn):
            batch_op.add_column(
                sa.Column("stripe_customer_id", sa.String(), nullable=True)
            )
            batch_op.create_index("idx_user_stripe_customer", ["stripe_customer_id"])
        if not migration.column_exists("user", "stripe_subscription_id", conn):
            batch_op.add_column(
                sa.Column("stripe_subscription_id", sa.String(), nullable=True)
            )
        if not migration.column_exists("user", "subscription_tier", conn):
            batch_op.add_column(
                sa.Column(
                    "subscription_tier",
                    sa.String(),
                    nullable=True,
                    server_default="free",
                )
            )
        if not migration.column_exists("user", "subscription_status", conn):
            batch_op.add_column(
                sa.Column(
                    "subscription_status",
                    sa.String(),
                    nullable=True,
                    server_default="active",
                )
            )
        if not migration.column_exists("user", "current_period_end", conn):
            batch_op.add_column(
                sa.Column("current_period_end", sa.DateTime(), nullable=True)
            )
        if not migration.column_exists("user", "cancel_at_period_end", conn):
            batch_op.add_column(
                sa.Column(
                    "cancel_at_period_end",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.text("0"),
                )
            )


def downgrade() -> None:
    with op.batch_alter_table("user", schema=None) as batch_op:
        batch_op.drop_index("idx_user_stripe_customer")
        batch_op.drop_column("cancel_at_period_end")
        batch_op.drop_column("current_period_end")
        batch_op.drop_column("subscription_status")
        batch_op.drop_column("subscription_tier")
        batch_op.drop_column("stripe_subscription_id")
        batch_op.drop_column("stripe_customer_id")
