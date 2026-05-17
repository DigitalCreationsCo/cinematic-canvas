"""Settings constants for px package."""

import os

# Development mode flag - can be overridden by environment variable
DEV = os.getenv("PORTALS_DEV", "false").lower() == "true"
