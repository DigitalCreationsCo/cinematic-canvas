from portals.api.health_check_router import health_check_router
from portals.api.log_router import log_router

# Note: router is imported directly via portals.api.router to avoid circular imports
# Use: from portals.api.router import router
__all__ = ["health_check_router", "log_router"]
