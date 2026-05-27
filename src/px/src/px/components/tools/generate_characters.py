import uuid

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from px.components.tools.global_tools import create_flow_nodes
from px.schema.schema import InputValueRequest


class GenerateCharactersInput(BaseModel):
    characters: list[dict] = Field(..., description="List of character attributes to generate.")


async def _run_character_pipeline_background(flow_id: uuid.UUID, characters: list[dict]):
    """The background task executed by AnyIO/Celery via TaskService.

    Leverages the Graph engine to execute the generation pipeline.
    """
    try:
        # Example: Programmatically loading a sub-graph or template flow that
        # contains your generation logic (LLM Attribute Gen -> DB Insert -> Image Gen)
        from portals.api.utils import build_graph_from_db
        from portals.services.deps import get_chat_service, session_scope

        # In reality, you might fetch a specific utility flow ID, or build one programmatically
        # using `build_flow_from_spec`.
        async with session_scope() as session:
            graph = await build_graph_from_db(flow_id=flow_id, session=session, chat_service=get_chat_service())

        # We pass the requested characters as inputs to the graph
        inputs = InputValueRequest(input_value={"characters": characters}, session=flow_id)

        # Leverage the Graph's built-in async evaluation
        # This utilizes RunnableVerticesManager under the hood to evaluate dependencies
        await graph.process(
            fallback_to_env_vars=True,
            start_component_id=None,  # Or specific entry vertex
            event_manager=None,  # Background task; UI is already optimistically updated
        )

        # Note: As components within the graph finish (like save to DB, generate images),
        # they can emit 'ENTITY_UPDATED' SSE events naturally.

    except Exception:
        # Handle failure (e.g., emit an SSE event to revert the optimistic UI nodes)
        pass


def make_generate_characters_tool(flow_id: uuid.UUID, event_manager) -> StructuredTool:
    """Factory: closes over flow_id. Clean schema for the LLM."""

    def generate_characters_func(characters: list[dict]) -> str:
        from portals.services.deps import get_task_service

        optimistic_nodes = []
        for char in characters:
            entity_id = str(uuid.uuid4())
            optimistic_nodes.append(
                {
                    "id": f"characterNode-{entity_id}",
                    "type": "genericNode",
                    "position": {"x": 250, "y": 250},  # Frontend auto-layout can handle exact placement
                    "data": {
                        "id": f"characterNode-{entity_id}",
                        "type": "CharacterComponent",
                        "node": {"display_name": char.get("name", "New Character"), "status": "generating"},
                    },
                }
            )

        create_flow_nodes(nodes=optimistic_nodes, edges=[], event_manager=event_manager)
        # event_manager is also closed over if you pass it here too
        # (see make_global_tools below for co-injection)
        task_service = get_task_service()
        if task_service:
            task_service.fire_and_forget_task(
                _run_character_pipeline_background,
                flow_id=flow_id,
                characters=characters,
            )
        return f"Dispatched {len(characters)} character(s) for generation."

    return StructuredTool.from_function(
        func=generate_characters_func,
        name="generate_characters",
        description="Dispatches a background job to generate character attributes and assets.",
        args_schema=GenerateCharactersInput,
    )
