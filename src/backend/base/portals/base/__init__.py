"""Backwards compatibility module for portals.base.

This module imports from px.base to maintain compatibility with existing code
that expects to import from portals.base.
"""

# Import all base modules from px for backwards compatibility
from px.base import *  # noqa: F403
