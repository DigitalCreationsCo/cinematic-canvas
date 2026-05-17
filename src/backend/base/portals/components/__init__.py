"""Portals Components module."""

from __future__ import annotations

from typing import Any

from px.components import __all__ as _px_all

__all__: list[str] = list(_px_all)


def __getattr__(attr_name: str) -> Any:
    """Forward attribute access to px.components."""
    from px import components

    return getattr(components, attr_name)


def __dir__() -> list[str]:
    """Forward dir() to px.components."""
    return list(__all__)
