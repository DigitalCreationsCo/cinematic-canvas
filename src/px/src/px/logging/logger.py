"""Backwards compatibility module for px.logging.logger.

This module provides backwards compatibility for code that imports from px.logging.logger.
All functionality has been moved to px.log.logger.
"""

# Ensure we maintain all the original exports
from px.log.logger import (
    InterceptHandler,
    LogConfig,
    configure,
    logger,
    setup_gunicorn_logger,
    setup_uvicorn_logger,
)

__all__ = [
    "InterceptHandler",
    "LogConfig",
    "configure",
    "logger",
    "setup_gunicorn_logger",
    "setup_uvicorn_logger",
]
