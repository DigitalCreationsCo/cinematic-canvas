"""Portals Agentic Flows.

This package contains flow definitions for the Portals Assistant feature.

Available flows:
- translation_flow: Intent classification and translation flow (Python)
- PortalsAssistant.json: Main assistant flow for Q&A and component generation (JSON)
"""

from portals.agentic.flows.translation_flow import (
    get_graph as get_translation_flow_graph,
)

__all__ = [
    "get_translation_flow_graph",
]
