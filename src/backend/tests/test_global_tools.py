import uuid
from unittest.mock import MagicMock

import pytest
from px.components.tools.global_tools import inject_global_tools_into_vertex, make_global_tools

# ── Fixtures ────────────────────────────────────────────────────────────────

MOCK_FLOW_ID = uuid.uuid4()
EXPECTED_TOOL_NAMES = {"create_flow_nodes", "generate_characters"}


@pytest.fixture
def mock_event_manager():
    return MagicMock()


@pytest.fixture
def ctx(mock_event_manager):
    """Shared injection context passed to every inject call."""
    return {"flow_id": MOCK_FLOW_ID, "event_manager": mock_event_manager}


class MockVertex:
    def __init__(self, has_tools=False):
        self.custom_component = MagicMock()
        if has_tools:
            self.custom_component.tools = ["ExistingTool"]
        else:
            del self.custom_component.tools


# ── Helpers ──────────────────────────────────────────────────────────────────


def tool_names(tools) -> set[str]:
    return {t.name for t in tools if hasattr(t, "name")}


# ── Tests ────────────────────────────────────────────────────────────────────


def test_inject_tools_into_component_without_existing_tools(ctx):
    """Tools list is initialised and all global tools are injected."""
    vertex = MockVertex(has_tools=False)

    inject_global_tools_into_vertex(vertex, **ctx)

    assert hasattr(vertex.custom_component, "tools")
    assert tool_names(vertex.custom_component.tools) == EXPECTED_TOOL_NAMES


def test_inject_tools_into_component_with_existing_tools(ctx):
    """Global tools are appended, not overwriting pre-existing tools."""
    vertex = MockVertex(has_tools=True)

    inject_global_tools_into_vertex(vertex, **ctx)

    tools = vertex.custom_component.tools
    assert "ExistingTool" in tools
    assert tool_names(t for t in tools if hasattr(t, "name")) == EXPECTED_TOOL_NAMES
    assert len(tools) == 1 + len(EXPECTED_TOOL_NAMES)  # existing + injected


def test_no_injection_if_no_custom_component(ctx):
    """Vertices without custom_component are silently ignored."""
    vertex = MagicMock(spec=[])  # no custom_component attribute

    inject_global_tools_into_vertex(vertex, **ctx)  # must not raise

    assert not hasattr(vertex, "custom_component")


def test_each_injection_produces_independent_tool_instances(mock_event_manager):
    """Factory must return fresh closures per call — tools from different flow_ids must not share state (guards against accidental global capture)."""
    flow_a, flow_b = uuid.uuid4(), uuid.uuid4()

    tools_a = make_global_tools(flow_id=flow_a, event_manager=mock_event_manager)
    tools_b = make_global_tools(flow_id=flow_b, event_manager=mock_event_manager)

    # Same names, different instances
    assert tool_names(tools_a) == tool_names(tools_b)
    for ta, tb in zip(tools_a, tools_b):
        assert ta is not tb


def test_event_manager_is_called_on_canvas_update(mock_event_manager):
    """create_flow_nodes tool forwards the payload to event_manager."""
    tools = make_global_tools(flow_id=MOCK_FLOW_ID, event_manager=mock_event_manager)
    create_tool = next(t for t in tools if t.name == "create_flow_nodes")

    nodes = [{"id": "node-1", "type": "genericNode"}]
    create_tool.func(nodes=nodes, edges=[])

    mock_event_manager.on_custom_event.assert_called_once()
    payload = mock_event_manager.on_custom_event.call_args.kwargs["data"]["payload"]
    assert payload["nodes"] == nodes


def test_no_event_manager_does_not_raise():
    """create_flow_nodes degrades gracefully when event_manager is None."""
    tools = make_global_tools(flow_id=MOCK_FLOW_ID, event_manager=None)
    create_tool = next(t for t in tools if t.name == "create_flow_nodes")

    result = create_tool.func(nodes=[{"id": "node-1"}], edges=[])

    assert "No active event manager" in result
