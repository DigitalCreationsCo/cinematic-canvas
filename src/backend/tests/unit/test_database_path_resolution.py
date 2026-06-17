"""Tests for database path resolution in settings.

These tests verify that the database URL is correctly resolved
from the new db_dir/db_name fields and computed_field property.
"""

import os
from pathlib import Path
from unittest.mock import patch


class TestDatabasePathResolution:
    """Test database path resolution in Settings."""

    def test_computed_database_url_uses_default_dir(self):
        """database_url should use ~/.portals/portals.db by default."""
        from px.services.settings.base import Settings

        settings = Settings()
        db_dir = Path.home() / ".portals"
        expected_url = f"sqlite+aiosqlite:////{(db_dir / 'portals.db').as_posix()}"
        assert settings.database_url == expected_url

    def test_db_dir_env_var_overrides_default(self, tmp_path):
        """PORTALS_DB_DIR should override the database directory."""
        from px.services.settings.base import Settings

        env = {k: v for k, v in os.environ.items() if k != "PORTALS_DATABASE_URL"}
        env["PORTALS_DB_DIR"] = str(tmp_path)

        with patch.dict(os.environ, env, clear=True):
            settings = Settings()

        expected_url = f"sqlite+aiosqlite:////{(tmp_path / 'portals.db').as_posix()}"
        assert settings.database_url == expected_url

    def test_db_name_env_var_overrides_default(self, tmp_path):
        """PORTALS_DB_NAME should override the database file name."""
        from px.services.settings.base import Settings

        env = {k: v for k, v in os.environ.items() if k != "PORTALS_DATABASE_URL"}
        env["PORTALS_DB_DIR"] = str(tmp_path)
        env["PORTALS_DB_NAME"] = "custom.db"

        with patch.dict(os.environ, env, clear=True):
            settings = Settings()

        expected_url = f"sqlite+aiosqlite:////{(tmp_path / 'custom.db').as_posix()}"
        assert settings.database_url == expected_url

    def test_explicit_database_url_env_var_takes_precedence(self, tmp_path):
        """PORTALS_DATABASE_URL env var should take precedence over db_dir/db_name."""
        from px.services.settings.base import Settings

        custom_url = "sqlite+aiosqlite:////custom/path/test.db"

        with patch.dict(
            os.environ,
            {
                "PORTALS_DATABASE_URL": custom_url,
                "PORTALS_DB_DIR": str(tmp_path),
            },
            clear=False,
        ):
            settings = Settings()

        assert settings.database_url == custom_url

    def test_database_dir_is_created(self, tmp_path):
        """The database directory should be created if it doesn't exist."""
        from px.services.settings.base import Settings

        non_existent_dir = tmp_path / "new" / "nested" / "dir"
        assert not non_existent_dir.exists()

        env = {k: v for k, v in os.environ.items() if k != "PORTALS_DATABASE_URL"}
        env["PORTALS_DB_DIR"] = str(non_existent_dir)

        with patch.dict(os.environ, env, clear=True):
            settings = Settings()

        assert non_existent_dir.exists()
        expected_url = f"sqlite+aiosqlite:////{(non_existent_dir / 'portals.db').as_posix()}"
        assert settings.database_url == expected_url
