"""add nap_columns to narrative tables

Phase: EXPAND

Adds ``nap_uri`` and ``nap_commit_hash`` columns to the characters,
locations, props, and scenes tables.  These are nullable string columns
that serve as temporary migration scaffolding — thin pointers from the
relational narrative rows to their corresponding NAP entities.

Revision ID: 951a5a3a713b  # pragma: allowlist secret
Revises: 0e9c4b77e935  # pragma: allowlist secret
Create Date: 2026-06-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "951a5a3a713b"  # pragma: allowlist secret
down_revision: str | None = "0e9c4b77e935"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # === characters ===
    with op.batch_alter_table("characters", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "nap_uri",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "nap_commit_hash",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )

    # === locations ===
    with op.batch_alter_table("locations", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "nap_uri",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "nap_commit_hash",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )

    # === props ===
    with op.batch_alter_table("props", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "nap_uri",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "nap_commit_hash",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )

    # === scenes ===
    with op.batch_alter_table("scenes", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "nap_uri",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "nap_commit_hash",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("scenes", schema=None) as batch_op:
        batch_op.drop_column("nap_commit_hash")
        batch_op.drop_column("nap_uri")

    with op.batch_alter_table("props", schema=None) as batch_op:
        batch_op.drop_column("nap_commit_hash")
        batch_op.drop_column("nap_uri")

    with op.batch_alter_table("locations", schema=None) as batch_op:
        batch_op.drop_column("nap_commit_hash")
        batch_op.drop_column("nap_uri")

    with op.batch_alter_table("characters", schema=None) as batch_op:
        batch_op.drop_column("nap_commit_hash")
        batch_op.drop_column("nap_uri")
