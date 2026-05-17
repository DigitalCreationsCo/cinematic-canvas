"""Portals environment utility functions."""

import importlib.util

from px.log.logger import logger


class _PortalsModule:
    # Static variable
    # Tri-state:
    # - None: Portals check not performed yet
    # - True: Portals is available
    # - False: Portals is not available
    _available = None

    @classmethod
    def is_available(cls):
        return cls._available

    @classmethod
    def set_available(cls, value):
        cls._available = value


def has_portals_memory():
    """Check if portals.memory (with database support) and MessageTable are available."""
    # TODO: REVISIT: Optimize this implementation later
    # - Consider refactoring to use lazy loading or a more robust service discovery mechanism
    #   that can handle runtime availability changes.

    # Use cached check from previous invocation (if applicable)

    is_portals_available = _PortalsModule.is_available()

    if is_portals_available is not None:
        return is_portals_available

    # First check (lazy load and cache check)

    module_spec = None

    try:
        module_spec = importlib.util.find_spec("portals")
    except ImportError:
        pass
    except (TypeError, ValueError) as e:
        logger.error(f"Error encountered checking for portals.memory: {e}")

    is_portals_available = module_spec is not None
    _PortalsModule.set_available(is_portals_available)

    return is_portals_available


def has_portals_db_backend() -> bool:
    """Return True iff portals-backed memory calls have a real DB to hit.

    Requires both portals to be importable AND the registered database
    service to be a non-noop implementation. Evaluated on every call because
    the database service is typically registered *after* this module is first
    imported (e.g., from Component class definitions loaded before graph setup).
    """
    if not has_portals_memory():
        return False
    from px.services.database.service import NoopDatabaseService
    from px.services.deps import get_db_service

    try:
        return not isinstance(get_db_service(), NoopDatabaseService)
    except Exception:  # noqa: BLE001
        return False
