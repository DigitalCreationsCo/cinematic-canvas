import hashlib
import os
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool, text
from sqlmodel import SQLModel

import portals.services.database.models  # noqa: F401  registers all tables with SQLModel.metadata


def _build_database_url() -> str:
    portals_database_url = os.getenv("PORTALS_DATABASE_URL")
    if portals_database_url:
        return portals_database_url
    db_dir = Path(os.getenv("PORTALS_DB_DIR", str(Path.home() / ".portals"))).expanduser().resolve()
    db_dir.mkdir(parents=True, exist_ok=True)
    db_name = os.getenv("PORTALS_DB_NAME", "portals.db")
    return f"sqlite:///{db_dir.as_posix()}/{db_name}"


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config
config.set_main_option("sqlalchemy.url", _build_database_url())

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}
target_metadata = SQLModel.metadata
target_metadata.naming_convention = NAMING_CONVENTION


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    config_section = config.get_section(config.config_ini_section, {})
    connectable = engine_from_config(
        config_section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            if connection.dialect.name == "postgresql":
                namespace = os.getenv("PORTALS_MIGRATION_LOCK_NAMESPACE")
                if namespace:
                    lock_key = int(hashlib.sha256(namespace.encode()).hexdigest()[:16], 16) % (2**63 - 1)
                else:
                    lock_key = 11223344
                connection.execute(text("SET LOCAL lock_timeout = '180s';"))
                connection.execute(text(f"SELECT pg_advisory_xact_lock({lock_key});"))
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
