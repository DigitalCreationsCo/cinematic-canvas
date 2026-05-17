import os

import pytest
from portals.services.deps import get_settings_service


@pytest.fixture(autouse=True)
def setup_database_url(tmp_path, monkeypatch):
    """Setup a temporary database URL for testing."""
    settings_service = get_settings_service()
    db_path = tmp_path / "test_performance.db"
    original_value = os.getenv("PORTALS_DATABASE_URL")
    monkeypatch.delenv("PORTALS_DATABASE_URL", raising=False)
    test_db_url = f"sqlite:///{db_path}"
    monkeypatch.setenv("PORTALS_DATABASE_URL", test_db_url)
    settings_service.set("database_url", test_db_url)
    yield
    # Restore original value if it existed
    if original_value is not None:
        monkeypatch.setenv("PORTALS_DATABASE_URL", original_value)
        settings_service.set("database_url", original_value)
    else:
        monkeypatch.delenv("PORTALS_DATABASE_URL", raising=False)


async def test_initialize_services():
    """Benchmark the initialization of services."""
    from portals.services.utils import initialize_services

    await initialize_services(fix_migration=False)
    settings_service = get_settings_service()
    assert "test_performance.db" in settings_service.settings.database_url


def test_setup_llm_caching():
    """Benchmark LLM caching setup."""
    from portals.interface.utils import setup_llm_caching

    setup_llm_caching()
    settings_service = get_settings_service()
    assert "test_performance.db" in settings_service.settings.database_url


async def test_initialize_super_user():
    """Benchmark super user initialization."""
    from portals.initial_setup.setup import initialize_auto_login_default_superuser
    from portals.services.utils import initialize_services

    await initialize_services(fix_migration=False)
    await initialize_auto_login_default_superuser()
    settings_service = get_settings_service()
    assert "test_performance.db" in settings_service.settings.database_url


async def test_get_and_cache_all_types_dict():
    """Benchmark get_and_cache_all_types_dict function."""
    from px.interface.components import get_and_cache_all_types_dict

    settings_service = get_settings_service()
    result = await get_and_cache_all_types_dict(settings_service)
    assert "vectorstores" in result
    assert "test_performance.db" in settings_service.settings.database_url


async def test_create_starter_projects():
    """Benchmark creation of starter projects."""
    from portals.initial_setup.setup import create_or_update_starter_projects
    from portals.services.utils import initialize_services
    from px.interface.components import get_and_cache_all_types_dict

    await initialize_services(fix_migration=False)
    settings_service = get_settings_service()
    types_dict = await get_and_cache_all_types_dict(settings_service)
    await create_or_update_starter_projects(types_dict)
    assert "test_performance.db" in settings_service.settings.database_url


async def test_load_flows():
    """Benchmark loading flows from directory."""
    from portals.initial_setup.setup import load_flows_from_directory

    await load_flows_from_directory()
    settings_service = get_settings_service()
    assert "test_performance.db" in settings_service.settings.database_url
