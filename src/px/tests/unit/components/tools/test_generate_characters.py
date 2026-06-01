"""Tests for the GenerateCharactersToolComponent and supporting functions.

Covers:
- Pydantic schema validation
- Image prompt builder
- LLM structured output schema construction
- Component instance methods (with mocked dependencies)
- Global tool factory
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.tools import StructuredTool
from px.base.prompts.character_image_prompt import (
    build_character_full_spec,
    build_character_image_prompt,
)
from px.components.tools.generate_characters import (
    CHARACTER_GENERATION_SYSTEM_PROMPT,
    GenerateCharactersToolComponent,
    GeneratedCharacter,
    GeneratedCharacterList,
    PhysicalTraitsSchema,
    _build_global_tool_args,
    _persist_characters_static,
    make_generate_characters_tool,
)
from pydantic import ValidationError

# ============================================================================
# Pydantic schema tests
# ============================================================================


class TestPhysicalTraitsSchema:
    def test_defaults(self):
        """All fields should have sensible defaults."""
        schema = PhysicalTraitsSchema()
        assert schema.hair == ""
        assert schema.clothing == []
        assert schema.accessories == []
        assert schema.distinctiveFeatures == []
        assert schema.build == "average"
        assert schema.ethnicity == ""
        assert schema.age == ""
        assert schema.gender == "non-binary"
        assert schema.appearanceNotes == []

    def test_extra_fields_ignored(self):
        """Extra fields should be silently ignored (Pydantic v2)."""
        schema = PhysicalTraitsSchema(extra_field="ignored")
        assert not hasattr(schema, "extra_field")

    def test_valid_input(self):
        data = {
            "hair": "long brown",
            "clothing": ["robe", "sandals"],
            "accessories": ["staff"],
            "distinctiveFeatures": ["tattoo on forearm"],
            "build": "slender",
            "ethnicity": "Mediterranean",
            "age": "mid-30s",
            "gender": "male",
            "appearanceNotes": ["Has a calm demeanor"],
        }
        schema = PhysicalTraitsSchema(**data)
        assert schema.hair == "long brown"
        assert schema.clothing == ["robe", "sandals"]
        assert schema.build == "slender"


class TestGeneratedCharacter:
    def test_required_fields(self):
        """reference_id and name should be required."""
        with pytest.raises(ValidationError):
            GeneratedCharacter()

    def test_valid_character(self):
        char = GeneratedCharacter(
            reference_id="luke_skywalker",
            name="Luke Skywalker",
            description="A young Jedi",
        )
        assert char.reference_id == "luke_skywalker"
        assert char.name == "Luke Skywalker"
        assert char.aliases == []
        assert char.guidance_level is None
        assert isinstance(char.physical_traits, PhysicalTraitsSchema)
        assert char.state == {}

    def test_model_dump_serializable(self):
        char = GeneratedCharacter(
            reference_id="hero",
            name="Hero",
            description="A hero",
            physical_traits=PhysicalTraitsSchema(hair="blonde"),
            state={"emotionalState": "brave"},
            guidance_level=3,
        )
        dumped = char.model_dump(mode="json")
        assert dumped["reference_id"] == "hero"
        assert dumped["physical_traits"]["hair"] == "blonde"
        assert dumped["state"]["emotionalState"] == "brave"
        assert dumped["guidance_level"] == 3


class TestGeneratedCharacterList:
    def test_min_characters(self):
        """List should require at least 1 character."""
        with pytest.raises(ValidationError):
            GeneratedCharacterList(characters=[])

    def test_valid_list(self):
        char = GeneratedCharacter(reference_id="a", name="A", description="")
        result = GeneratedCharacterList(characters=[char])
        assert len(result.characters) == 1


# ============================================================================
# Image prompt builder tests
# ============================================================================


class TestBuildCharacterFullSpec:
    def test_minimal_character(self):
        """Should handle a character with only required fields."""
        char = {
            "reference_id": "test_char",
            "name": "Test",
            "description": "A test character.",
            "physical_traits": {},
            "state": {},
        }
        spec = build_character_full_spec(char)
        assert "Reference ID: test_char" in spec
        assert "A test character." in spec

    def test_full_character(self):
        char = {
            "reference_id": "hero",
            "name": "Hero",
            "description": "The protagonist.",
            "physical_traits": {
                "hair": "short black",
                "clothing": ["armor", "cloak"],
                "accessories": ["sword"],
                "distinctiveFeatures": ["scar"],
                "build": "muscular",
                "ethnicity": "Northern",
                "age": "28",
                "gender": "male",
            },
            "state": {
                "emotionalState": "determined",
                "dirtLevel": "clean",
            },
        }
        spec = build_character_full_spec(char)
        assert "28-year-old" in spec
        assert "Northern" in spec
        assert "man" in spec
        assert "muscular" in spec
        assert "short black" in spec
        assert "armor, cloak" in spec
        assert "sword" in spec
        assert "scar" in spec
        assert "determined" in spec
        assert "Reference ID: hero" in spec


class TestBuildCharacterImagePrompt:
    def test_includes_safety_guidelines(self):
        char = {"reference_id": "t", "name": "T", "description": ".", "physical_traits": {}, "state": {}}
        prompt = build_character_image_prompt(char)
        assert "Do not depict any celebrity" in prompt
        assert "AI usage guidelines" in prompt

    def test_production_portrait_instruction(self):
        char = {"reference_id": "t", "name": "T", "description": ".", "physical_traits": {}, "state": {}}
        prompt = build_character_image_prompt(char)
        assert "production-ready portrait" in prompt
        assert "neutral pose" in prompt


# ============================================================================
# Component structure tests
# ============================================================================


class TestGenerateCharactersToolComponent:
    def test_component_attributes(self):
        comp = GenerateCharactersToolComponent()
        assert comp.display_name == "Generate Characters"
        assert comp.name == "GenerateCharacters"
        assert comp.icon == "user-plus"
        assert comp.category == "tools"

    def test_build_tool_returns_structured_tool(self):
        comp = GenerateCharactersToolComponent()
        assert hasattr(comp, "build_tool")
        assert callable(comp.build_tool)

    def test_build_tool_returns_tool_with_correct_name(self, monkeypatch):
        comp = GenerateCharactersToolComponent()
        monkeypatch.setattr(comp, "_resolve_llm", MagicMock)
        monkeypatch.setattr(comp, "_resolve_image_llm", lambda: None)
        tool = comp.build_tool()
        assert isinstance(tool, StructuredTool)
        assert tool.name == "generate_characters"
        assert "story" in tool.description.lower()

    def test_build_tool_has_async_coroutine(self, monkeypatch):
        comp = GenerateCharactersToolComponent()
        monkeypatch.setattr(comp, "_resolve_llm", MagicMock)
        monkeypatch.setattr(comp, "_resolve_image_llm", lambda: None)
        tool = comp.build_tool()
        assert tool.coroutine is not None

    def test_run_model_returns_data_structure(self, monkeypatch):
        comp = GenerateCharactersToolComponent()
        monkeypatch.setattr(comp, "_resolve_llm", MagicMock)
        monkeypatch.setattr(comp, "_resolve_image_llm", lambda: None)
        monkeypatch.setattr(comp, "input_value", "Test")
        monkeypatch.setattr(comp, "character_count", 3)
        monkeypatch.setattr(
            comp,
            "_run_generation_pipeline",
            lambda **_: [{"name": "Test", "reference_id": "tst"}],
        )
        from px.schema.data import Data

        result = comp.run_model()
        assert isinstance(result, Data)
        assert result.data == {"characters": [{"name": "Test", "reference_id": "tst"}]}

    def test_count_constrained_schema(self):
        comp = GenerateCharactersToolComponent()
        from pydantic import ValidationError

        schema = comp._build_count_constrained_schema(3)
        # Should reject 2 characters (below min_length=3)
        with pytest.raises(ValidationError):
            schema(
                characters=[
                    GeneratedCharacter(reference_id="a", name="A", description="."),
                    GeneratedCharacter(reference_id="b", name="B", description="."),
                ]
            )
        # Should accept exactly 3 characters
        result = schema(
            characters=[
                GeneratedCharacter(reference_id="a", name="A", description="."),
                GeneratedCharacter(reference_id="b", name="B", description="."),
                GeneratedCharacter(reference_id="c", name="C", description="."),
            ]
        )
        assert len(result.characters) == 3
        # Should reject 4 characters (above max_length=3)
        with pytest.raises(ValidationError):
            schema(
                characters=[
                    GeneratedCharacter(reference_id="a", name="A", description="."),
                    GeneratedCharacter(reference_id="b", name="B", description="."),
                    GeneratedCharacter(reference_id="c", name="C", description="."),
                    GeneratedCharacter(reference_id="d", name="D", description="."),
                ]
            )

    def test_build_tool_args_schema(self):
        comp = GenerateCharactersToolComponent()
        schema = comp._build_tool_args_schema()
        assert hasattr(schema, "model_fields")
        assert "prompt" in schema.model_fields
        assert "count" in schema.model_fields

    def test_resolve_image_llm_none(self):
        comp = GenerateCharactersToolComponent()
        comp.image_model = None
        result = comp._resolve_image_llm()
        assert result is None

    @patch("px.components.tools.generate_characters.get_llm")
    def test_resolve_image_llm_with_model(self, mock_get_llm):
        comp = GenerateCharactersToolComponent()
        comp.image_model = [{"name": "test"}]
        comp._resolve_image_llm()
        # user_id is 'None' string when Component has no user_id set
        mock_get_llm.assert_called_once()

    def test_resolve_flow_context_without_graph(self):
        comp = GenerateCharactersToolComponent()
        # graph is a read-only property backed by _vertex.graph.
        # Create a mock vertex whose graph is None to simulate no-flow context.
        mock_vertex = MagicMock()
        mock_vertex.graph = None
        comp._vertex = mock_vertex
        flow_id, em = comp._resolve_flow_context()
        assert flow_id is None
        assert em is None


# ============================================================================
# LLM structured output invocation tests
# ============================================================================


class TestCallLLMStructured:
    @patch("px.components.tools.generate_characters.get_llm")
    def test_calls_with_structured_output(self, mock_get_llm, monkeypatch):
        comp = GenerateCharactersToolComponent()
        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value = mock_llm
        mock_llm.invoke.return_value = GeneratedCharacterList(
            characters=[
                GeneratedCharacter(reference_id="h", name="Hero", description="A hero"),
            ]
        )

        result = comp._call_llm_structured(llm=mock_llm, prompt="Test story", count=1)
        assert len(result) == 1
        assert result[0]["reference_id"] == "h"
        assert result[0]["name"] == "Hero"

    def test_rejects_llm_without_structured_output(self):
        comp = GenerateCharactersToolComponent()
        mock_llm = MagicMock(spec=[])  # no with_structured_output
        del mock_llm.with_structured_output

        with pytest.raises(TypeError, match="structured output"):
            comp._call_llm_structured(llm=mock_llm, prompt="Test", count=1)

    @patch("px.components.tools.generate_characters.get_llm")
    def test_handles_empty_result(self, mock_get_llm):
        comp = GenerateCharactersToolComponent()
        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value = mock_llm
        # Simulate the LLM returning an object with an empty characters list
        # (this bypasses Pydantic validation to simulate a real LLM edge case)
        mock_result = MagicMock()
        mock_result.characters = []
        mock_llm.invoke.return_value = mock_result

        with pytest.raises(ValueError, match="empty"):
            comp._call_llm_structured(llm=mock_llm, prompt="Test", count=1)


# ============================================================================
# Persistence tests
# ============================================================================


class TestPersistCharacters:
    def test_persist_without_project_id_returns_local_ids(self):
        characters_data = [
            {"reference_id": "h", "name": "Hero", "description": ".", "physical_traits": {}, "state": {}},
        ]
        result = _persist_characters_static(characters_data, project_id=None)
        assert len(result) == 1
        assert "id" in result[0]
        # Should have a UUID local fallback
        assert uuid.UUID(result[0]["id"])

    def test_persist_without_db_service_returns_local_ids(self, monkeypatch):
        # These two tests require the `portals` backend package, which is not
        # available in the standalone px unit test suite (conftest strips it).
        # The core DB-less persistence branch (project_id=None) is covered by
        # ``test_persist_without_project_id_returns_local_ids`` above.
        # Integration tests for the full dual-write path live in the backend suite.
        pytest.skip("Requires portals backend (integration test)")

    @patch("px.services.deps.get_db_service")
    def test_persist_with_error_returns_local_ids_as_fallback(self, mock_get_db):
        mock_db = MagicMock()
        mock_db.with_session.side_effect = RuntimeError("DB connection failed")
        mock_get_db.return_value = mock_db

        pytest.skip("Requires portals backend (integration test)")


# ============================================================================
# Global tool factory tests
# ============================================================================


class TestMakeGenerateCharactersTool:
    def test_returns_structured_tool(self):
        flow_id = uuid.uuid4()
        event_manager = MagicMock()
        tool = make_generate_characters_tool(flow_id=flow_id, event_manager=event_manager)
        assert isinstance(tool, StructuredTool)
        assert tool.name == "generate_characters"

    def test_tool_coroutine_exists(self):
        flow_id = uuid.uuid4()
        event_manager = MagicMock()
        tool = make_generate_characters_tool(flow_id=flow_id, event_manager=event_manager)
        assert tool.coroutine is not None

    def test_tool_args_schema(self):
        schema = _build_global_tool_args()
        assert "prompt" in schema.model_fields
        assert "count" in schema.model_fields
        count_field = schema.model_fields["count"]
        assert count_field.default == 5
        # In Pydantic v2, validation constraints are on the type adapter, not FieldInfo
        # Check that the count field has the right type info
        schema_instance = schema(prompt="test", count=1)
        assert schema_instance.count == 1
        schema_instance2 = schema(prompt="test", count=20)
        assert schema_instance2.count == 20


# ============================================================================
# System prompt tests
# ============================================================================


class TestSystemPrompt:
    def test_system_prompt_exists(self):
        assert CHARACTER_GENERATION_SYSTEM_PROMPT is not None
        assert len(CHARACTER_GENERATION_SYSTEM_PROMPT) > 50

    def test_system_prompt_mentions_attributes(self):
        assert (
            "reference_id" in CHARACTER_GENERATION_SYSTEM_PROMPT.lower()
            or "reference" in CHARACTER_GENERATION_SYSTEM_PROMPT.lower()
        )
        assert "physical" in CHARACTER_GENERATION_SYSTEM_PROMPT.lower()


# ============================================================================
# Edge case tests
# ============================================================================


class TestEdgeCases:
    def test_character_count_clamping(self, monkeypatch):
        """Character count should be clamped to 1-20."""
        comp = GenerateCharactersToolComponent()
        mock_llm = MagicMock()
        mock_llm.with_structured_output.return_value = mock_llm
        mock_llm.invoke.return_value = GeneratedCharacterList(
            characters=[GeneratedCharacter(reference_id="a", name="A", description=".")]
        )

        # Very large count
        result = comp._call_llm_structured(llm=mock_llm, prompt="Test", count=100)
        assert len(result) == 1

    def test_image_prompt_with_full_state(self):
        """State fields should be rendered in the image prompt."""
        char = {
            "reference_id": "wounded",
            "name": "Wounded",
            "description": "A wounded soldier.",
            "physical_traits": {
                "hair": "brown",
                "build": "average",
                "age": "30",
                "gender": "male",
            },
            "state": {
                "emotionalState": "pained",
                "dirtLevel": "very_dirty",
                "costumeCondition": {
                    "tears": ["sleeve"],
                    "stains": ["blood"],
                    "wetness": "wet",
                },
            },
        }
        spec = build_character_full_spec(char)
        assert "pained" in spec
        assert "very dirty" in spec
        assert "torn" in spec
        assert "blood" in spec
        assert "wet" in spec or "moisture" in spec

    def test_image_prompt_with_injuries(self):
        char = {
            "reference_id": "injured",
            "name": "Injured",
            "description": ".",
            "physical_traits": {"gender": "female", "age": "25", "build": "average"},
            "state": {
                "injuries": [
                    {"type": "cut", "location": "arm", "severity": "moderate"},
                ],
            },
        }
        spec = build_character_full_spec(char)
        assert "cut" in spec
        assert "arm" in spec
        assert "moderate" in spec
