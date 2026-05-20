"""empty message

Revision ID: a382dc96dcc3
Revises: b97ad5e57116, d306e5c17c41
Create Date: 2026-05-19 23:26:37.089615

Phase: MIGRATE
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "a382dc96dcc3"
down_revision: Union[str, None] = ("b97ad5e57116", "d306e5c17c41")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
