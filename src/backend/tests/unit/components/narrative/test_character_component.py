"""Comprehensive tests for CharacterComponent.

Covers:
  - ``_validate_selected_entity``  — module-level guard
  - ``_build_character_system_prompt`` — persona prompt construction
  - ``build``  — character data read, error surfacing, cache eviction
  - ``build_model``  — LLM instantiation delegation
  - ``character_response``  — persona-driven LLM response flow
  - ``_fetch_character_data``  — caching mechanics
  - ``_validate_outputs``  — override of LCModelComponent validation
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from px.components.narrative.character import (
    CharacterComponent,
    _validate_selected_entity,
)
from px.schema.data import Data
from px.schema.message import Message

# =========================================================================
# HELPERS
# =========================================================================


def _make_character_dict(**overrides: Any) -> dict:
    """Build a realistic character dict as returned by ``model_dump()``."""
    defaults = {
        "id": str(uuid4()),
        "name": "Aldric Thornwood",
        "aliases": ["The Shadow", "Lord Thornwood"],
        "physical_traits": {
            "height": "6'2\"",
            "build": "athletic",
            "hair": "silver-streaked black",
            "eyes": "piercing grey",
        },
        "state": {
            "health": "wounded",
            "location": "Whispering Woods",
            "quest": "Find the lost relic",
        },
        "guidance_level": 3,
        "project_id": str(uuid4()),
        "reference_id": "CHAR-001",
    }
    return {**defaults, **overrides}


def _make_minimal_character_dict(**overrides: Any) -> dict:
    """Character dict with only required fields."""
    defaults = {
        "name": "Eira",
        "physical_traits": {},
        "state": {},
        "aliases": [],
    }
    return {**defaults, **overrides}


def _build_component(**kwargs: Any) -> CharacterComponent:
    """Instantiate a CharacterComponent via ``__new__``, bypassing heavy ``Component.__init__``.

    Patches ``_vertex`` so that ``self.graph`` resolves without a real graph.
    """
    comp = CharacterComponent.__new__(CharacterComponent)
    # Minimal init attributes that ``Component.__init__`` normally sets.
    comp._output_logs = {}
    comp._current_output = ""
    comp._metadata = {}
    comp._ctx = {}
    comp._code = None
    comp._logs = []
    comp._inputs = {}
    comp._outputs_map = {}
    comp._results = {}
    comp._attributes = {}
    comp._edges = []
    comp._components = []
    comp._event_manager = None
    comp._token_usage = None
    comp._state_model = None
    comp._telemetry_input_values = None
    # Private attributes accessed by read-only properties.
    comp._user_id = None
    comp._vertex = SimpleNamespace(
        graph=SimpleNamespace(
            session_id="test-session",
            flow_id=str(uuid4()),
            user_id=None,
        ),
    )
    comp._character_cache = {}
    comp.status = None

    # Apply keyword attributes
    for key, value in kwargs.items():
        setattr(comp, key, value)

    return comp


# =========================================================================
# TESTS: _validate_selected_entity  (module-level helper)
# =========================================================================


class TestValidateSelectedEntity:
    @pytest.mark.parametrize("invalid_input", [None, "", "  "])
    def test_rejects_none_or_empty(self, invalid_input: str | None) -> None:
        """None, empty, and whitespace-only strings must raise ValueError."""
        with pytest.raises(ValueError, match="No character selected"):
            _validate_selected_entity(invalid_input)

    @pytest.mark.parametrize(
        "placeholder",
        [
            "No entities found",
            "No active flow context",
            "No project found",
        ],
    )
    def test_rejects_placeholder_messages(self, placeholder: str) -> None:
        """Placeholder messages from ``get_entity_options`` must be rejected."""
        with pytest.raises(ValueError, match="No character available"):
            _validate_selected_entity(placeholder)

    def test_accepts_valid_name(self) -> None:
        """A real character name must not raise."""
        _validate_selected_entity("Aldric Thornwood")  # no error


# =========================================================================
# TESTS: _build_character_system_prompt  (static method)
# =========================================================================


class TestBuildCharacterSystemPrompt:
    def test_full_character_prompt(self) -> None:
        """All fields present produces a detailed persona prompt."""
        char = _make_character_dict()
        prompt = CharacterComponent._build_character_system_prompt(char)

        assert "Aldric Thornwood" in prompt
        assert "The Shadow, Lord Thornwood" in prompt
        assert "silver-streaked black" in prompt
        assert "Whispering Woods" in prompt
        assert "Guidance level: 3" in prompt
        assert "roleplaying" in prompt
        assert "Never break character" in prompt

    def test_minimal_character_prompt(self) -> None:
        """Minimal fields still produces a valid persona prompt."""
        char = _make_minimal_character_dict()
        prompt = CharacterComponent._build_character_system_prompt(char)

        assert "Eira" in prompt
        assert "roleplaying" in prompt
        # Optional sections must be absent when data is empty.
        assert "also known as" not in prompt
        assert "physical traits" not in prompt
        assert "narrative state" not in prompt
        assert "Guidance level" not in prompt

    def test_handles_missing_name(self) -> None:
        """Missing name falls back to ``Unknown Character``."""
        prompt = CharacterComponent._build_character_system_prompt({})
        assert "Unknown Character" in prompt

    def test_embeds_json_traits_in_code_fence(self) -> None:
        """Physical traits and state are rendered as JSON in markdown code fences."""
        char = _make_character_dict()
        prompt = CharacterComponent._build_character_system_prompt(char)

        assert "```json" in prompt
        assert json.dumps(char["physical_traits"], indent=2) in prompt
        assert json.dumps(char["state"], indent=2) in prompt

    def test_no_guidance_when_none(self) -> None:
        """Guidance level omitted when absent or None."""
        char = _make_minimal_character_dict()
        prompt = CharacterComponent._build_character_system_prompt(char)
        assert "Guidance level" not in prompt


# =========================================================================
# TESTS: build()  (character_data output)
# =========================================================================


class TestBuild:
    def test_returns_character_data(self) -> None:
        """Happy path: returns Data with the character dict."""
        expected = _make_character_dict()
        component = _build_component(model="gpt-4o")
        component._character_cache = {}  # empty cache forces DB read

        with patch.object(
            component,
            "_execute_read_patch_logic",
            return_value=Data(data=expected),
        ) as mock_read:
            result = component.build("Aldric Thornwood")

        assert isinstance(result, Data)
        assert result.data == expected
        mock_read.assert_called_once_with(
            "Aldric Thornwood",
            update_database=False,
            updated_data={},
        )

    def test_returns_error_data_on_db_failure(self) -> None:
        """DB errors are surfaced as Data with an ``error`` key (no crash)."""
        component = _build_component()
        component._character_cache = {}

        with patch.object(
            component,
            "_execute_read_patch_logic",
            return_value=Data(data={"error": "Aldric Thornwood not found in database."}),
        ):
            result = component.build("Aldric Thornwood")

        assert isinstance(result, Data)
        assert "error" in result.data
        assert "not found" in result.data["error"]

    def test_evicts_cache_when_update_database_true(self) -> None:
        """``update_database=True`` must evict the cache entry before re-reading."""
        component = _build_component()
        component._character_cache = {
            "Aldric": {"name": "Aldric (stale)"},
        }

        fresh_data = _make_character_dict(name="Aldric (fresh)")

        with patch.object(
            component,
            "_execute_read_patch_logic",
            return_value=Data(data=fresh_data),
        ) as mock_read:
            result = component.build("Aldric", update_database=True)

        assert result.data["name"] == "Aldric (fresh)"
        mock_read.assert_called_once()
        # Cache must be updated to fresh data.
        assert component._character_cache["Aldric"]["name"] == "Aldric (fresh)"

    def test_passes_cache_to_downstream(self) -> None:
        """Subsequent build() calls with the same entity must use cache."""
        component = _build_component()
        component._character_cache = {
            "Aldric": _make_character_dict(),
        }

        with patch.object(
            component,
            "_execute_read_patch_logic",
        ) as mock_read:
            result = component.build("Aldric")

        mock_read.assert_not_called()  # served from cache
        assert result.data["name"] == "Aldric Thornwood"


# =========================================================================
# TESTS: build_model()
# =========================================================================


class TestBuildModel:
    @patch("px.components.narrative.characters.character.get_llm")
    def test_delegates_to_get_llm(self, mock_get_llm: MagicMock) -> None:
        """build_model() must forward model config to ``get_llm()``."""
        mock_llm = MagicMock()
        mock_get_llm.return_value = mock_llm

        component = _build_component(
            model=["gpt-4o"],
            _user_id="user-1",
            api_key="sk-test",  # pragma: allowlist secret
            temperature=0.7,
            stream=False,
        )

        result = component.build_model()

        assert result is mock_llm
        mock_get_llm.assert_called_once_with(
            model=["gpt-4o"],
            user_id="user-1",
            api_key="sk-test",  # pragma: allowlist secret
            temperature=0.7,
            stream=False,
        )

    @patch("px.components.narrative.characters.character.get_llm")
    def test_default_temperature_when_unset(self, mock_get_llm: MagicMock) -> None:
        """When temperature is not set, the default of 0.5 must be used."""
        component = _build_component(model=["gpt-4o"])
        # temperature is not set on the component.

        component.build_model()

        _call = mock_get_llm.call_args
        assert _call[1]["temperature"] == 0.5
        assert _call[1]["stream"] is False


# =========================================================================
# TESTS: character_response()  (async LLM output)
# =========================================================================


class TestCharacterResponse:
    @pytest.mark.asyncio
    async def test_happy_path(self) -> None:
        """Full flow: fetch character → build prompt → invoke LLM → return Message."""
        char = _make_character_dict()
        component = _build_component(
            selected_entity="Aldric Thornwood",
            model=["gpt-4o"],
            input_value="Greetings, traveler!",
            stream=False,
        )
        component._character_cache = {"Aldric Thornwood": char}

        expected_message = Message(text="I am Aldric, the shadowy lord. What brings you here?")

        with (
            patch.object(component, "build_model", return_value=MagicMock()) as mock_build_model,
            patch.object(
                component,
                "get_chat_result",
                new=AsyncMock(return_value=expected_message),
            ) as mock_chat,
        ):
            result = await component.character_response()

        assert result is expected_message
        assert component.status is expected_message

        mock_build_model.assert_called_once()
        mock_chat.assert_awaited_once()

        # Verify the system prompt contains character context.
        system_msg: str = mock_chat.call_args[1]["system_message"]
        assert "Aldric Thornwood" in system_msg
        assert "The Shadow, Lord Thornwood" in system_msg

        # Verify input is forwarded.
        assert mock_chat.call_args[1]["input_value"] == "Greetings, traveler!"
        assert mock_chat.call_args[1]["stream"] is False

    @pytest.mark.asyncio
    async def test_raises_when_no_character_selected(self) -> None:
        """No character selected must raise ValueError."""
        component = _build_component(selected_entity=None)

        with pytest.raises(ValueError, match="No character selected"):
            await component.character_response()

    @pytest.mark.asyncio
    async def test_raises_when_character_not_in_db(self) -> None:
        """Character not in DB must surface the error."""
        component = _build_component(selected_entity="Ghost")

        with (
            patch.object(
                component,
                "_execute_read_patch_logic",
                return_value=Data(data={"error": "Ghost not found in database."}),
            ),
            pytest.raises(ValueError, match="Ghost not found"),
        ):
            await component.character_response()

    @pytest.mark.asyncio
    async def test_raises_when_no_model_connected(self) -> None:
        """Missing model connection must raise ValueError."""
        char = _make_character_dict()
        component = _build_component(
            selected_entity="Aldric Thornwood",
            model=None,  # no model connected
        )
        component._character_cache = {"Aldric Thornwood": char}

        with pytest.raises(ValueError, match="Language Model must be connected"):
            await component.character_response()

    @pytest.mark.asyncio
    async def test_uses_cache_from_build(self) -> None:
        """When build() was called first, character_response() must use cached data."""
        char = _make_character_dict()
        component = _build_component(
            selected_entity="Aldric Thornwood",
            model=["gpt-4o"],
            input_value="Hello",
        )
        component._character_cache = {"Aldric Thornwood": char}
        expected_message = Message(text="Hello back!")

        with (
            patch.object(component, "build_model", return_value=MagicMock()),
            patch.object(
                component,
                "get_chat_result",
                new=AsyncMock(return_value=expected_message),
            ),
        ):
            # Pretend build() was already called — cache is populated.
            result = await component.character_response()

        assert result.text == "Hello back!"

    @pytest.mark.asyncio
    async def test_empty_input_value_does_not_crash(self) -> None:
        """An empty or missing input_value must not raise."""
        char = _make_minimal_character_dict(name="Silent Sam")
        component = _build_component(
            selected_entity="Silent Sam",
            model=["gpt-4o"],
            input_value="",  # empty
        )
        component._character_cache = {"Silent Sam": char}

        with (
            patch.object(component, "build_model", return_value=MagicMock()),
            patch.object(
                component,
                "get_chat_result",
                new=AsyncMock(return_value=Message(text="")),
            ),
        ):
            result = await component.character_response()

        assert isinstance(result, Message)


# =========================================================================
# TESTS: _fetch_character_data  (caching internals)
# =========================================================================


class TestFetchCharacterData:
    def test_cache_miss_then_hit(self) -> None:
        """First call reads DB; second call returns cached data."""
        char = _make_character_dict()
        component = _build_component()
        component._character_cache = {}

        db_mock = MagicMock(
            side_effect=[
                Data(data=char),  # first call → read
            ],
        )

        with patch.object(component, "_execute_read_patch_logic", db_mock):
            # First call (cache miss) → DB read
            result1 = component._fetch_character_data("Aldric Thornwood")
            # Second call (cache hit) → no DB read
            result2 = component._fetch_character_data("Aldric Thornwood")

        assert result1 == char
        assert result2 == char
        assert result1 is result2  # same cached dict
        db_mock.assert_called_once()  # only one DB call

    def test_raises_on_db_error(self) -> None:
        """DB error dict must be surfaced as ValueError."""
        component = _build_component()
        component._character_cache = {}

        with (
            patch.object(
                component,
                "_execute_read_patch_logic",
                return_value=Data(data={"error": "Character Death not found."}),
            ),
            pytest.raises(ValueError, match="Death not found"),
        ):
            component._fetch_character_data("Death")

    def test_lazy_init_cache_when_missing(self) -> None:
        """If ``_character_cache`` was never set (e.g. direct __new__), it must be lazily created."""
        component = _build_component()
        # Remove the cache attribute entirely.
        if hasattr(component, "_character_cache"):
            del component._character_cache

        char = _make_character_dict()
        with patch.object(
            component,
            "_execute_read_patch_logic",
            return_value=Data(data=char),
        ):
            result = component._fetch_character_data("Eira")

        assert result == char
        assert hasattr(component, "_character_cache")
        assert component._character_cache["Eira"] == char


# =========================================================================
# TESTS: _validate_outputs  (override of LCModelComponent)
# =========================================================================


class TestValidateOutputs:
    def test_passes_with_valid_selected_output(self) -> None:
        """Valid selected_output must not raise."""
        component = _build_component()
        component.selected_output = "character_data"
        component._outputs_map = {
            "character_data": MagicMock(),
            "character_response": MagicMock(),
        }
        component._validate_outputs()  # no error

    def test_raises_with_invalid_selected_output(self) -> None:
        """Invalid selected_output must raise ValueError."""
        component = _build_component()
        component.selected_output = "nonexistent"
        component._outputs_map = {
            "character_data": MagicMock(),
        }
        with pytest.raises(ValueError, match=r"selected_output.*nonexistent"):
            component._validate_outputs()

    def test_skips_when_selected_output_none(self) -> None:
        """selected_output is None (default) must not raise."""
        component = _build_component()
        component.selected_output = None
        component._outputs_map = {}
        component._validate_outputs()  # no error


# =========================================================================
# TESTS: Integration — build + character_response share cache
# =========================================================================


class TestBuildAndResponseCacheIntegration:
    @pytest.mark.asyncio
    async def test_build_then_response_uses_one_db_read(self) -> None:
        """Calling build() first populates cache, so character_response() avoids a second DB read."""
        char = _make_character_dict()
        component = _build_component(
            selected_entity="Aldric Thornwood",
            model=["gpt-4o"],
            input_value="Hello",
        )
        component._character_cache = {}

        db_mock = MagicMock(return_value=Data(data=char))

        with (
            patch.object(component, "_execute_read_patch_logic", db_mock),
            patch.object(component, "build_model", return_value=MagicMock()),
            patch.object(
                component,
                "get_chat_result",
                new=AsyncMock(return_value=Message(text="Hi!")),
            ),
        ):
            # build() hits the DB once.
            data_result = component.build("Aldric Thornwood")
            # character_response() uses cache — no DB call.
            msg_result = await component.character_response()

        assert data_result.data["name"] == "Aldric Thornwood"
        assert msg_result.text == "Hi!"
        # Only one DB call for both outputs.
        assert db_mock.call_count == 1
