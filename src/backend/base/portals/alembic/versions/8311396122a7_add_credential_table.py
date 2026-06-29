"""add credential table

Phase: EXPAND

Revision ID: 8311396122a7
Revises: b2869e932bd3
Create Date: 2026-06-28 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8311396122a7"
down_revision: str | None = "b2869e932bd3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "credential",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "provider",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            comment="Provider name, e.g. 'OpenAI'",
        ),
        sa.Column(
            "api_key",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            comment="Encrypted managed API key",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            comment="When this credential was first stored",
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            comment="When this credential was last updated",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("credential", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_credential_provider"), ["provider"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("credential", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_credential_provider"))

    op.drop_table("credential")
