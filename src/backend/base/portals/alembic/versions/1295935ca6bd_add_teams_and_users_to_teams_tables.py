"""Add teams and users_to_teams tables

Revision ID: 1295935ca6bd
Revises: 0e6138e7a0c2
Create Date: 2026-05-19 08:11:32.786067

Phase: EXPAND
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from portals.utils import migration

# revision identifiers, used by Alembic.
revision: str = "1295935ca6bd"  # pragma: allowlist secret
down_revision: str | None = "0e6138e7a0c2"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

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
