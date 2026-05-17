"""Exceptions raised by the Portals SDK."""

from __future__ import annotations


class PortalsError(Exception):
    """Base class for all Portals SDK errors."""


class PortalsHTTPError(PortalsError):
    """An HTTP error was returned by the Portals API."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"HTTP {status_code}: {detail}")


class PortalsNotFoundError(PortalsHTTPError):
    """The requested resource was not found (404)."""


class PortalsAuthError(PortalsHTTPError):
    """Authentication failed (401/403)."""


class PortalsValidationError(PortalsHTTPError):
    """The request payload was rejected by the server (422)."""


class PortalsConnectionError(PortalsError):
    """Could not connect to the Portals instance."""


class PortalsTimeoutError(PortalsError):
    """A background job or polling operation exceeded its timeout.

    Adapted from ``PortalsV2TimeoutError`` in portals-ai/sdk PR #1
    (Janardan Singh Kavia, IBM Corp., Apache 2.0).
    """


class EnvironmentNotFoundError(PortalsError):
    """The named environment is not defined in the environments config."""

    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(
            f"Environment {name!r} not found. Check your portals-environments.toml (or PORTALS_ENV variable)."
        )


class EnvironmentConfigError(PortalsError):
    """The environments config file is malformed or missing required fields."""
