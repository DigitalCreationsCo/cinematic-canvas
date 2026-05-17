"""Backwards compatibility module for px.logging.

This module provides backwards compatibility for code that imports from px.logging.
All functionality has been moved to px.log.
"""

# Re-export everything from px.log for backwards compatibility
from px.log.logger import configure, logger

# Maintain the same __all__ exports
__all__ = ["configure", "logger"]
