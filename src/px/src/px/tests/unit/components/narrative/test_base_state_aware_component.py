from unittest.mock import MagicMock

import pytest
from px.components.base_state_aware_component import BaseStateAwareComponent, InjectedNapContext, NapContextError


@pytest.fixture
def mock_nap_payload():
    return {
        "universe": "portals_test_universe",
        "entities": [
            {"uri": "nap://test/world/default", "type": "world", "name": "Cinematic Universe"},
            {
                "uri": "nap://test/character/john_doe",
                "type": "character",
                "name": "John Doe",
                "representations": {"avatar": {"url": "http://img.com/avatar.png"}},
                "references": {"groups": ["hero_squad"]},
            },
        ],
    }


@pytest.fixture
def mock_component(mock_nap_payload):
    component = BaseStateAwareComponent()

    # Mock Langflow graph context
    component.graph = MagicMock()
    component.graph.flow_id = "test_flow_123"
    component.graph.flow_state = {"nap_payload": mock_nap_payload}
    return component


def test_injected_nap_context_indexing(mock_nap_payload):
    ctx = InjectedNapContext(mock_nap_payload)
    assert ctx.universe_name == "portals_test_universe"

    # O(1) retrieval checks
    char = ctx.get_entity("nap://test/character/john_doe")
    assert char["name"] == "John Doe"

    # Collection checks
    worlds = ctx.get_entities("world")
    assert len(worlds) == 1
    assert worlds[0]["uri"] == "nap://test/world/default"


def test_component_get_entity(mock_component):
    entity = mock_component.get_entity("nap://test/character/john_doe")
    assert entity["type"] == "character"


def test_component_entity_not_found(mock_component):
    with pytest.raises(NapContextError):
        mock_component.get_entity("nap://test/character/missing")


def test_component_query_dot_notation(mock_component):
    avatar_url = mock_component.query("nap://test/character/john_doe", "representations.avatar.url")
    assert avatar_url == "http://img.com/avatar.png"

    invalid_path = mock_component.query("nap://test/character/john_doe", "representations.missing.url")
    assert invalid_path is None


def test_component_missing_flow_state():
    component = BaseStateAwareComponent()
    component.graph = MagicMock()
    component.graph.flow_state = {}  # Empty state, missing payload

    with pytest.raises(NapContextError, match="NAP payload was not injected"):
        component.get_world()
