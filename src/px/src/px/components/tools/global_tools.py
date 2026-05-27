# global_tools.py
import uuid

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from px.components.tools.generate_characters import make_generate_characters_tool


class CreateFlowNodesInput(BaseModel):
    nodes: list[dict] = Field(..., description="React Flow node objects to render.")
    edges: list[dict] = Field(default_factory=list, description="Optional edges.")


def create_flow_nodes(nodes: list[dict], edges: list[dict], event_manager) -> str:
    """Takes event_manager explicitly. Callable by anyone with the reference."""
    if event_manager:
        event_manager.on_custom_event(data={"event_type": "canvas_update", "payload": {"nodes": nodes, "edges": edges}})
        return f"Successfully rendered {len(nodes)} nodes on the canvas."
    return "No active event manager; no UI updates emitted."


def make_create_flow_nodes_tool(event_manager) -> StructuredTool:
    """Factory: closes over event_manager so the LLM never sees it.

    Called once per vertex build, not at module import time.
    """

    def _func(nodes: list[dict], edges: list[dict] = None) -> str:
        return create_flow_nodes(nodes, edges or [], event_manager)

    return StructuredTool.from_function(
        func=_func,
        name="create_flow_nodes",
        description="Generates React Flow JSON structures and updates the canvas dynamically.",
        args_schema=CreateFlowNodesInput,
    )


def make_global_tools(flow_id: uuid.UUID, event_manager) -> list[StructuredTool]:
    """Single entry point: build all context-bound tools for one vertex invocation.

    Both flow_id and event_manager are closed over — invisible to the LLM.
    """
    return [
        make_create_flow_nodes_tool(event_manager=event_manager),
        make_generate_characters_tool(flow_id=flow_id, event_manager=event_manager),
        # make_generate_locations_tool(flow_id=flow_id, event_manager=event_manager),
    ]


def is_agent_vertex(vertex) -> bool:
    """Helper to identify if the current node is a master assistant/agent."""
    return getattr(vertex.custom_component, "is_global_agent", False)


def inject_global_tools_into_vertex(vertex, flow_id: uuid.UUID, event_manager):
    """Called from build.py during _build_vertex. Creates fresh, context-bound tool instances — no globals."""
    if not hasattr(vertex, "custom_component"):
        return

    if not hasattr(vertex.custom_component, "tools"):
        vertex.custom_component.tools = []

    tools = make_global_tools(flow_id=flow_id, event_manager=event_manager)
    vertex.custom_component.tools.extend(tools)
