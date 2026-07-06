"""add nap_repository table

Phase: EXPAND

Revision ID: a1b2c3d4e5f6
Revises: 95d2ec932a09
Create Date: 2026-07-05 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"  # pragma: allowlist secret
down_revision: str | None = "95d2ec932a09"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "nap_repository",
        sa.Column("id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("folder_id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("nap_uri", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("repo_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("remote_url", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("entity_count", sa.Integer(), nullable=False),
        sa.Column("last_commit_hash", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("error_message", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["folder_id"], ["folder.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("folder_id"),
    )
    with op.batch_alter_table("nap_repository", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_nap_repository_name"), ["name"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("nap_repository", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_nap_repository_name"))
    op.drop_table("nap_repository")
