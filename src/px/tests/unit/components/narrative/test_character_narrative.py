"""Tests for Character Narrative component."""

import pytest
from portals.schema import Data
from px.components.narrative.character_narrative import NarrativeCharacterComponent


class TestCharacterNarrative:
    """Test suite for NarrativeCharacterComponent."""

    def test_combobox_initialization(self):
        """Test that the component initializes with combobox enabled."""
        component = NarrativeCharacterComponent()
        # Check that the selected_entity input is configured as combobox
        selected_entity_input = next(
            (inp for inp in component.inputs if inp.name == "selected_entity"),
            None,
        )
        assert selected_entity_input is not None
        assert hasattr(selected_entity_input, "combobox")
        assert selected_entity_input.combobox is True
        assert selected_entity_input.value == ""

    def test_get_entity_options_returns_empty_when_no_characters(self):
        """Test that get_entity_options returns empty list when no characters exist."""
        component = NarrativeCharacterComponent()
        # Mock get_entities to return empty list
        component.get_entities = lambda entity_type: []
        options = component.get_entity_options()
        error_msg = f"Expected empty list, got {options}"
        assert options == [], error_msg

    def test_get_entity_options_builds_name_to_uri_mapping(self):
        """Test that get_entity_options builds name-to-URI mapping."""
        component = NarrativeCharacterComponent()
        # Mock get_entities to return character data
        component.get_entities = lambda entity_type: [
            {"name": "Lord Thornwood", "uri": "nap://test/character/1"},
            {"name": "Eira Swiftblade", "uri": "nap://test/character/2"},
        ]
        options = component.get_entity_options()
        assert len(options) == 2
        assert "Lord Thornwood" in options
        assert "Eira Swiftblade" in options
        # Check that URI mapping was built
        assert hasattr(component, "_name_to_uri")
        assert component._name_to_uri["Lord Thornwood"] == "nap://test/character/1"
        assert component._name_to_uri["Eira Swiftblade"] == "nap://test/character/2"

    def test_build_with_empty_selected_entity_and_no_prompt(self):
        """Test that build returns info message when no entity selected and no prompt."""
        component = NarrativeCharacterComponent()
        result = component.build(selected_entity="")
        assert isinstance(result, Data)
        assert "info" in result.data
        assert "No character selected" in result.data["info"]

    def test_build_with_existing_character(self):
        """Test that build loads existing character from NAP."""
        component = NarrativeCharacterComponent()
        # Mock the necessary methods
        component.get_entities = lambda entity_type: [
            {"name": "Lord Thornwood", "uri": "nap://test/character/1"},
        ]
        component._fetch_character_data = lambda entity_name: {
            "name": entity_name,
            "type": "character",
        }
        result = component.build(selected_entity="Lord Thornwood")
        assert isinstance(result, Data)
        assert result.data["name"] == "Lord Thornwood"
        assert "error" not in result.data

    def test_build_with_new_character_name_and_prompt(self):
        """Test that build generates draft when new name typed with prompt."""
        component = NarrativeCharacterComponent()
        # Set generation prompt
        component.generation_prompt = "A brave knight with a mysterious past"
        # Mock the draft generation method
        component._generate_character_draft = lambda prompt: Data(
            data={
                "name": "Sir Reginald",
                "type": "character",
                "physical_traits": {"hair": "brown", "eyes": "blue"},
            }
        )
        result = component.build(selected_entity="Sir Reginald")
        assert isinstance(result, Data)
        assert result.data["name"] == "Sir Reginald"
        assert "error" not in result.data

    def test_generate_character_draft_without_model(self):
        """Test that draft generation fails gracefully when no model connected."""
        component = NarrativeCharacterComponent()
        component.model = None
        result = component._generate_character_draft("Generate a character")
        assert isinstance(result, Data)
        assert "error" in result.data
        assert "Language Model must be connected" in result.data["error"]

    def test_build_config_includes_generation_prompt(self):
        """Test that build_config includes generation_prompt field."""
        component = NarrativeCharacterComponent()
        config = component.build_config()
        assert "generation_prompt" in config
        assert config["generation_prompt"]["display_name"] == "Generation Prompt"
        assert config["generation_prompt"]["advanced"] is True

    def test_build_config_combobox_display_name(self):
        """Test that build_config has correct display_name for combobox."""
        component = NarrativeCharacterComponent()
        config = component.build_config()
        assert config["selected_entity"]["display_name"] == "Character Name"
        assert "Type a character name" in config["selected_entity"]["info"]
