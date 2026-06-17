"""Scope files to folders

Revision ID: 7b2c9f4a1d3e
Revises: a07a6552c8cf
Create Date: 2026-06-16 00:00:00.000000

Phase: EXPAND
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

logger = logging.getLogger(__name__)

# revision identifiers, used by Alembic.
revision: str = "7b2c9f4a1d3e"  # pragma: allowlist secret
down_revision: str | None = "a07a6552c8cf"  # pragma: allowlist secret
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_FOLDER_NAME = "Starter Project"


def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def _unique_constraint_names(table_name: str, columns: set[str]) -> list[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    names: list[str] = []
    for constraint in inspector.get_unique_constraints(table_name):
        constraint_columns = set(constraint.get("column_names") or [])
        constraint_name = constraint.get("name")
        if constraint_name and constraint_columns == columns:
            names.append(constraint_name)
    return names


def _assign_orphaned_files_to_default_folder() -> None:
    """Assign files with ``folder_id IS NULL`` to the user's default project.

    Without this, existing files from before the migration would not appear in
    any project's file listing and become effectively invisible to the user.

    If the user does not yet have a ``"Starter Project"`` folder, the orphaned
    files are left with ``NULL`` folder_id for now.  The application will create
    the default folder on next login (see ``get_or_create_default_folder``) and
    the files will remain accessible via the legacy (non-project-scoped) API.
    """
    conn = op.get_bind()
    metadata = sa.MetaData()
    file_table = sa.Table("file", metadata, autoload_with=conn)
    folder_table = sa.Table("folder", metadata, autoload_with=conn)

    # Find all distinct user_ids with files that have NULL folder_id
    orphaned = conn.execute(
        sa.select(file_table.c.user_id).where(file_table.c.folder_id.is_(None)).distinct()
    ).fetchall()

    if not orphaned:
        logger.info("No orphaned files found (all files already have a folder_id).")
        return

    logger.info("Found %d user(s) with orphaned files. Assigning to default folder.", len(orphaned))

    for (user_id,) in orphaned:
        # Find the user's default folder
        folder = conn.execute(
            sa.select(folder_table.c.id).where(
                folder_table.c.user_id == user_id,
                folder_table.c.name == DEFAULT_FOLDER_NAME,
            )
        ).first()

        if not folder:
            # Do NOT create a folder here - the ``folder`` table has many
            # ``nullable=False`` columns with only Python-level defaults
            # (storyboard, metadata, status, …) that raw SQL INSERT cannot
            # supply.  The application creates the default folder on next login,
            # and legacy files without a folder remain accessible because the
            # backend still supports ``folder_id IS NULL``.
            logger.warning(
                "User %s has orphaned files but no '%s' folder yet. Leaving files unscoped until the user logs in.",
                user_id,
                DEFAULT_FOLDER_NAME,
            )
            continue

        folder_id = folder[0]

        # Assign orphaned files to the folder
        result = conn.execute(
            file_table.update()
            .where(
                file_table.c.user_id == user_id,
                file_table.c.folder_id.is_(None),
            )
            .values(folder_id=folder_id)
        )
        logger.info(
            "Assigned %d orphaned file(s) for user %s to folder %s",
            result.rowcount,
            user_id,
            folder_id,
        )


def upgrade() -> None:
    if not _table_exists("file"):
        return

    add_folder_id = not _column_exists("file", "folder_id")
    unique_constraints_to_drop = _unique_constraint_names("file", {"name", "user_id"})

    with op.batch_alter_table("file") as batch_op:
        if add_folder_id:
            batch_op.add_column(sa.Column("folder_id", sa.Uuid(), nullable=True))
            batch_op.create_foreign_key("fk_file_folder_id_folder", "folder", ["folder_id"], ["id"], ondelete="CASCADE")
            batch_op.create_index("ix_file_folder_id", ["folder_id"], unique=False)

        # Existing installations may have either an unnamed SQLModel constraint or
        # the named constraint created by prior migrations. Drop any exact
        # (name, user_id) unique constraint before creating the project-scoped one.
        for constraint_name in unique_constraints_to_drop:
            batch_op.drop_constraint(constraint_name, type_="unique")
        batch_op.create_unique_constraint("file_name_user_id_folder_id_key", ["name", "user_id", "folder_id"])

    # Assign orphaned files (folder_id IS NULL) to the user's default folder.
    # This runs after the schema changes so the column exists.
    _assign_orphaned_files_to_default_folder()


def downgrade() -> None:
    if not _table_exists("file"):
        return

    drop_folder_id = _column_exists("file", "folder_id")
    unique_constraints_to_drop = _unique_constraint_names("file", {"name", "user_id", "folder_id"})

    with op.batch_alter_table("file") as batch_op:
        for constraint_name in unique_constraints_to_drop:
            batch_op.drop_constraint(constraint_name, type_="unique")
        batch_op.create_unique_constraint("file_name_user_id_key", ["name", "user_id"])
        if drop_folder_id:
            batch_op.drop_index("ix_file_folder_id")
            batch_op.drop_constraint("fk_file_folder_id_folder", type_="foreignkey")
            batch_op.drop_column("folder_id")
