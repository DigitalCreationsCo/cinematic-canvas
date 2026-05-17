"""Entry point for running the Portals Agentic MCP server.

This allows running the server with:
    python -m portals.agentic.mcp
"""

from portals.agentic.mcp.server import mcp

if __name__ == "__main__":
    mcp.run()
