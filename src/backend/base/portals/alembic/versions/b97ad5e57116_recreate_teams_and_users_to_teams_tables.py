"""Recreate teams and users_to_teams tables

The teams tables were originally created in migration 1295935ca6bd
but later dropped by a locally-generated migration chain that was
never committed. This migration recreates them with idempotent
table-existence checks.

Revision ID: b97ad5e57116
Revises: 1295935ca6bd
Create Date: 2026-05-19 23:00:13.009041

Phase: EXPAND
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from portals.utils import migration


# revision identifiers, used by Alembic.
revision: str = "b97ad5e57116"  # pragma: allowlist secret
down_revision: Union[str, None] = "1295935ca6bd"  # pragma: allowlist secret
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TEAMS_TABLE = "teams"
JUNCTION_TABLE = "users_to_teams"


def upgrade() -> None:
    conn = op.get_bind()

    # ---- teams table ----
    if not migration.table_exists(TEAMS_TABLE, conn):
        op.create_table(
            TEAMS_TABLE,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_teams_name"),
            TEAMS_TABLE,
            ["name"],
        )

    # ---- users_to_teams junction table ----
    if not migration.table_exists(JUNCTION_TABLE, conn):
        op.create_table(
            JUNCTION_TABLE,
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("team_id", sa.Uuid(), nullable=False),
            sa.Column(
                "role",
                sa.String(),
                nullable=False,
                server_default="member",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(
                ["user_id"],
                ["user.id"],
                ondelete="CASCADE",
            ),
            sa.ForeignKeyConstraint(
                ["team_id"],
                ["teams.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "user_id",
                "team_id",
                name="uq_user_team",
            ),
        )
        op.create_index(
            op.f("ix_users_to_teams_user_id"),
            JUNCTION_TABLE,
            ["user_id"],
        )
        op.create_index(
            op.f("ix_users_to_teams_team_id"),
            JUNCTION_TABLE,
            ["team_id"],
        )


def downgrade() -> None:
    conn = op.get_bind()

    if migration.table_exists(JUNCTION_TABLE, conn):
        op.drop_index(op.f("ix_users_to_teams_team_id"), table_name=JUNCTION_TABLE)
        op.drop_index(op.f("ix_users_to_teams_user_id"), table_name=JUNCTION_TABLE)
        op.drop_table(JUNCTION_TABLE)

    if migration.table_exists(TEAMS_TABLE, conn):
        op.drop_index(op.f("ix_teams_name"), table_name=TEAMS_TABLE)
        op.drop_table(TEAMS_TABLE)
