"""Portals ServiceManager - re-exports from px for backwards compatibility."""

from __future__ import annotations

# Re-export everything from px
from px.services.manager import NoFactoryRegisteredError, ServiceManager, get_service_manager

__all__ = ["NoFactoryRegisteredError", "ServiceManager", "get_service_manager"]


def initialize_settings_service() -> None:
    """Initialize the settings manager."""
    from px.services.settings import factory as settings_factory

    get_service_manager().register_factory(settings_factory.SettingsServiceFactory())


def initialize_session_service() -> None:
    """Initialize the session manager."""
    from portals.services.cache import factory as cache_factory
    from portals.services.session import factory as session_service_factory

    initialize_settings_service()

    get_service_manager().register_factory(cache_factory.CacheServiceFactory())
    get_service_manager().register_factory(session_service_factory.SessionServiceFactory())
