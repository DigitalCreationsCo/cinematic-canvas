import uuid
from unittest.mock import MagicMock

import pytest
from px.components.tools.global_tools import create_flow_nodes_func, reset_tool_context, set_tool_context


@pytest.mark.asyncio
async def test_create_flow_nodes_emits_event():
    """Verify that calling the tool triggers an event on the EventManager."""
    mock_event_manager = MagicMock()
    flow_id = str(uuid.uuid4())

    # Setup context
    ctx = set_tool_context(mock_event_manager, flow_id)

    try:
        nodes = [{"id": "test-node", "type": "Test"}]
        result = create_flow_nodes_func(nodes=nodes)

        # Verify result and event trigger
        assert "Successfully rendered" in result
        mock_event_manager.on_custom_event.assert_called_once()

        # Verify payload structure
        args, _ = mock_event_manager.on_custom_event.call_args
        data = args[0]
        assert data["event_type"] == "canvas_update"
        assert data["payload"]["nodes"] == nodes

    finally:
        reset_tool_context(*ctx)
