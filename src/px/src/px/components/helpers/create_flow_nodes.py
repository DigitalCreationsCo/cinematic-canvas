from pydantic import BaseModel, Field


class CreateFlowNodesInput(BaseModel):
    nodes: list[dict] = Field(..., description="React Flow node objects to render.")
    edges: list[dict] = Field(default_factory=list, description="Optional edges.")


def create_flow_nodes(nodes: list[dict], edges: list[dict], event_manager) -> str:
    """Takes event_manager explicitly. Callable by anyone with the reference."""
    if event_manager:
        event_manager.on_custom_event(data={"event_type": "canvas_update", "payload": {"nodes": nodes, "edges": edges}})
        return f"Successfully rendered {len(nodes)} nodes on the canvas."
    return "No active event manager; no UI updates emitted."
