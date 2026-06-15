"""Add notification, feature_gate, and pending_job tables.

Revision ID: 0022_add_notification_feature_gate_and_pending_job
Revises: 0021_add_stripe_product_and_credit_tables
Create Date: 2026-06-13 00:00:00.000000

Phase: EXPAND
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from portals.utils import migration

revision: str = "0022_add_notification_feature_gate_and_pending_job"
down_revision: str | None = "0021_add_stripe_product_and_credit_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. Create notification table ──────────────────────────────────
    if not migration.table_exists("notification", conn):
        op.create_table(
            "notification",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False, index=True),
            sa.Column("type", sa.String(), nullable=False, server_default="info"),
            sa.Column("title", sa.String(), nullable=False, server_default=""),
            sa.Column("message", sa.String(), nullable=False, server_default=""),
            sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("reference_type", sa.String(), nullable=True),
            sa.Column("reference_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    # ── 2. Create feature_gate table ─────────────────────────────────
    if not migration.table_exists("feature_gate", conn):
        op.create_table(
            "feature_gate",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("feature", sa.String(), nullable=False, index=True),
            sa.Column("tier", sa.String(), nullable=False, index=True),
            sa.Column("description", sa.String(), nullable=False, server_default=""),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("0")),
            sa.Column("config", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("feature", "tier", name="uq_feature_gate_feature_tier"),
        )

    # ── 3. Create pending_job table ───────────────────────────────────
    if not migration.table_exists("pending_job", conn):
        op.create_table(
            "pending_job",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("user_id", sa.String(), nullable=False, index=True),
            sa.Column("flow_id", sa.String(), nullable=False),
            sa.Column("required_credits", sa.Integer(), nullable=False),
            sa.Column("reference_id", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id", "flow_id", name="uq_pending_job_user_flow"),
        )

    # ── 4. Seed default feature gates ─────────────────────────────────
    # Deny-by-default: only explicitly enabled features are added here.
    # Image generation: available on all tiers with different costs
    _seed_feature_gate(
        conn, "image_generation", "free", "Generate images from text prompts", enabled=True, config={"credit_cost": 5}
    )
    _seed_feature_gate(
        conn, "image_generation", "pro", "Generate images from text prompts", enabled=True, config={"credit_cost": 3}
    )
    _seed_feature_gate(
        conn, "image_generation", "studio", "Generate images from text prompts", enabled=True, config={"credit_cost": 1}
    )

    # Video generation: pro+ only
    _seed_feature_gate(
        conn, "video_generation", "pro", "Generate videos from text prompts", enabled=True, config={"credit_cost": 20}
    )
    _seed_feature_gate(
        conn,
        "video_generation",
        "studio",
        "Generate videos from text prompts",
        enabled=True,
        config={"credit_cost": 10},
    )

    # Language model access: free on all tiers (no credit cost)
    _seed_feature_gate(conn, "language", "free", "Access to language models", enabled=True, config={"credit_cost": 0})
    _seed_feature_gate(conn, "language", "pro", "Access to language models", enabled=True, config={"credit_cost": 0})
    _seed_feature_gate(conn, "language", "studio", "Access to language models", enabled=True, config={"credit_cost": 0})


def _seed_feature_gate(
    conn,
    feature: str,
    tier: str,
    description: str,
    enabled: bool = True,
    config: dict | None = None,
) -> None:
    """Idempotently insert a feature gate row if it doesn't exist."""
    result = conn.execute(
        sa.text("SELECT 1 FROM feature_gate WHERE feature = :feature AND tier = :tier"),
        {"feature": feature, "tier": tier},
    )
    if result.fetchone() is None:
        conn.execute(
            sa.text("""
                INSERT INTO feature_gate (feature, tier, description, enabled, config)
                VALUES (:feature, :tier, :description, :enabled, :config)
            """),
            {
                "feature": feature,
                "tier": tier,
                "description": description,
                "enabled": enabled,
                "config": json.dumps(config) if config else None,
            },
        )


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists("pending_job", conn):
        op.drop_table("pending_job")

    if migration.table_exists("feature_gate", conn):
        op.drop_table("feature_gate")

    if migration.table_exists("notification", conn):
        op.drop_table("notification")
