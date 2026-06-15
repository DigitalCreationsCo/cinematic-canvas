"""Add stripe_product, user_credit, credit_transaction tables + rename enterprise tier to studio.

Revision ID: 0021_add_stripe_product_and_credit_tables
Revises: 0020_add_canvas_tables
Create Date: 2026-06-12 00:00:00.000000

Phase: EXPAND
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from portals.utils import migration

revision: str = "0021_add_stripe_product_and_credit_tables"
down_revision: str | None = "0020_add_canvas_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Create stripe_product table ───────────────────────────────
    if not migration.table_exists("stripe_product", conn):
        op.create_table(
            "stripe_product",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("stripe_product_id", sa.String(), nullable=False, index=True),
            sa.Column("stripe_price_id", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("name", sa.String(), nullable=False, server_default=""),
            sa.Column("description", sa.String(), nullable=False, server_default=""),
            sa.Column("tier", sa.String(), nullable=True, index=True),
            sa.Column("type", sa.String(), nullable=False, server_default="subscription"),
            sa.Column("credits", sa.Integer(), nullable=True),
            sa.Column("unit_amount", sa.Integer(), nullable=True),
            sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
            sa.Column("metadata", sa.JSON(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("last_synced_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── 2. Create user_credit table ──────────────────────────────────
    if not migration.table_exists("user_credit", conn):
        op.create_table(
            "user_credit",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False, unique=True, index=True),
            sa.Column("allowance_balance", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("purchased_balance", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_earned", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("total_spent", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("trial_credits_used", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("last_allowance_date", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── 3. Create credit_transaction table ───────────────────────────
    if not migration.table_exists("credit_transaction", conn):
        op.create_table(
            "credit_transaction",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False, index=True),
            sa.Column("amount", sa.Integer(), nullable=False),
            sa.Column("balance_type", sa.String(), nullable=False, server_default="allowance"),
            sa.Column("reason", sa.String(), nullable=False),
            sa.Column("reference_type", sa.String(), nullable=True),
            sa.Column("reference_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "idx_credit_transaction_user_reason",
            "credit_transaction",
            ["user_id", "reason", "reference_type", "reference_id"],
            unique=False,
        )

    # ── 4. Rename existing enterprise -> studio tier ─────────────────
    if migration.column_exists("user", "subscription_tier", conn):
        op.execute("UPDATE \"user\" SET subscription_tier = 'studio' WHERE subscription_tier = 'enterprise'")


def downgrade() -> None:
    conn = op.get_bind()

    # Revert tier rename (studio -> enterprise)
    if migration.column_exists("user", "subscription_tier", conn):
        op.execute("UPDATE \"user\" SET subscription_tier = 'enterprise' WHERE subscription_tier = 'studio'")

    # Drop credit_transaction table
    if migration.table_exists("credit_transaction", conn):
        op.drop_table("credit_transaction")

    # Drop user_credit table
    if migration.table_exists("user_credit", conn):
        op.drop_table("user_credit")

    # Drop stripe_product table
    if migration.table_exists("stripe_product", conn):
        op.drop_table("stripe_product")
