"""Entry point for the Portals MCP server.

Usage:
    python -m px.mcp
    # or via console script:
    px-mcp

Environment variables:
    PORTALS_SERVER_URL: Portals server URL (default: http://localhost:7860)
    PORTALS_API_KEY: API key for authentication (skips login)
"""

from px.mcp.server import mcp


def main():
    mcp.run()


if __name__ == "__main__":
    main()
