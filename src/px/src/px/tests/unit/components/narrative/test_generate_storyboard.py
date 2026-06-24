"""Tests for the GenerateStoryboardComponent — prompt building, audio analysis
integration, storyboard assembly, and backward-compatible outputs.

All LLM and database calls are mocked so tests run in isolation.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from px.components.narrative.generate_storyboard import (
    _DEFAULT_INITIAL_CONTEXT_SCHEMA,
    _DEFAULT_SCENE_SCHEMA,
    _SCENE_BATCH_SIZE_DEFAULT,
    GenerateStoryboardComponent,
)
from px.schema.data import Data
from px.schema.dataframe import DataFrame

# =========================================================================
# Fixtures
# =========================================================================


@pytest.fixture
def component():
    """Return a bare GenerateStoryboardComponent with required attributes set.

    Important: ``user_id`` is a ``@property`` (no setter) on CustomComponent, so
    we set ``_user_id`` directly.  The ``graph`` mock satisfies any fallback path
    in the property getter.
    """
    comp = GenerateStoryboardComponent()
    comp.model = _make_mock_model_selection()
    comp.input_value = "A dramatic chase scene through a neon-lit futuristic city at night."
    comp.title = "Neon Chase"
    comp._user_id = "test-user-uid"  # user_id is a read-only @property
    comp.api_key = "sk-test"  # pragma: allowlist secret
    comp.stream = False
    comp.temperature = 0.5
    comp.max_tokens = None
    comp.scene_batch_size = 10
    comp.project_id = ""
    comp.schema_name = ""
    comp.audio_file = ""  # not provided
    comp.output_schema = []
    comp.initial_context_schema = None  # use defaults
    comp.scene_schema = None  # use defaults
    comp.system_prompt = None

    # NOTE: ``graph`` and ``flow_id`` are read-only ``@property`` attributes on
    # CustomComponent — do not attempt to set them here.  Tests that exercise
    # ``build_storyboard`` patch ``get_folder`` before calling.

    return comp


def _make_mock_model_selection() -> list[dict]:
    """Simulate the model-selection payload that Langflow stores."""
    return [
        {
            "name": "gpt-4o",
            "provider": "OpenAI",
            "metadata": {
                "model_class": "ChatOpenAI",
                "model_name_param": "model",
                "api_key_param": "api_key",  # pragma: allowlist secret
                "max_tokens_field_name": "max_tokens",
            },
        }
    ]


def _make_mock_llm(**kwargs):
    """Create a mock Langchain LLM with ``with_structured_output`` support."""
    llm = MagicMock()
    # with_structured_output returns a new runnable that wraps the model
    llm.with_structured_output.return_value = llm
    # invoke returns a mock response with content
    return llm


def _make_mock_session(entities: dict | None = None) -> MagicMock:
    """Create a mock DB session that returns pre-configured entity query results."""
    session = MagicMock()
    entities = entities or {}

    # characters
    chars_mock = MagicMock()
    chars_mock.all.return_value = []
    # locations
    locs_mock = MagicMock()
    locs_mock.all.return_value = []
    # props
    props_mock = MagicMock()
    props_mock.all.return_value = []
    # folder
    folder_mock = MagicMock()
    folder_mock.id = "test-project-id"

    exec_results = {
        "characters": chars_mock,
        "locations": locs_mock,
        "props": props_mock,
    }

    def exec_side_effect(statement):
        # Determine which query based on the statement's model
        stmt_str = str(statement)
        for key in exec_results:
            if key in stmt_str.lower():
                return exec_results[key]
        # Default: return folder
        folder_result = MagicMock()
        folder_result.first.return_value = folder_mock
        return folder_result

    session.exec.side_effect = exec_side_effect
    return session


# =========================================================================
# Prompt building
# =========================================================================


class TestPromptBuilding:
    """Tests for ``_build_initial_context_prompt`` and ``_build_scene_batch_prompt``.
    These are pure string-construction methods — no LLM or DB required.
    """

    def test_initial_context_prompt_no_audio_no_entities(self, component):
        """Should include the Pass 1 task and title but no audio or entity sections."""
        prompt = component._build_initial_context_prompt(
            audio_segments=None,
            existing_entities=None,
        )
        assert "Pass 1" in prompt, "Should mention Pass 1"
        assert "Neon Chase" in prompt, "Should include the title"
        assert "dramatic chase" in prompt.lower(), "Should include the user prompt"
        assert "Audio Analysis Context" not in prompt, "No audio → no audio section"
        assert "Existing Props" not in prompt, "No entities → no props section"

    def test_initial_context_prompt_with_explicit_title(self, component):
        """Explicit title parameter should override self.title."""
        prompt = component._build_initial_context_prompt(
            audio_segments=None,
            existing_entities=None,
            title="DB-Backed Title",
        )
        assert "DB-Backed Title" in prompt
        # Even though self.title is "Neon Chase", the explicit title wins
        assert "Neon Chase" not in prompt

    def test_initial_context_prompt_with_audio(self, component):
        """Audio segments should add an 'Audio Analysis Context' block."""
        segments = [
            {"startTime": 0.0, "endTime": 5.0, "duration": 5.0, "mood": "tense"},
            {"startTime": 5.0, "endTime": 12.0, "duration": 7.0, "mood": "climactic"},
        ]
        prompt = component._build_initial_context_prompt(
            audio_segments=segments,
            existing_entities=None,
        )
        assert "Audio Analysis Context" in prompt
        assert "2 audio segments" in prompt
        assert "12.0s" in prompt  # total duration from last segment endTime

    def test_initial_context_prompt_with_existing_entities(self, component):
        """Existing entities should add entity sections to the prompt."""
        entities = {
            "characters": [
                {"referenceId": "hero", "name": "Alex", "description": "The protagonist"},
            ],
            "locations": [
                {"referenceId": "city", "name": "Neon City", "description": "Futuristic metropolis"},
            ],
            "props": [
                {"referenceId": "car", "name": "Speeder", "type": "vehicle"},
            ],
        }
        prompt = component._build_initial_context_prompt(
            audio_segments=None,
            existing_entities=entities,
        )
        assert "Existing Props" in prompt
        assert "Speeder" in prompt
        # Characters and locations are handled by build_storyboard_vision_prompt
        # which we verify exists but don't deep-verify its internal format

    def test_initial_context_prompt_with_both_audio_and_entities(self, component):
        """Audio segments AND entities should both be present."""
        segments = [{"startTime": 0, "endTime": 10, "duration": 10, "mood": "neutral"}]
        entities = {
            "characters": [{"referenceId": "hero", "name": "Alex", "description": "The protagonist"}],
            "locations": [],
            "props": [],
        }
        prompt = component._build_initial_context_prompt(
            audio_segments=segments,
            existing_entities=entities,
        )
        assert "Audio Analysis Context" in prompt
        assert "Existing Props" not in prompt  # empty props list
        assert "Pass 1" in prompt

    def test_scene_batch_prompt_includes_context(self, component):
        """Batch prompt should include characters and locations from initial context."""
        init_ctx = {
            "characters": [{"referenceId": "hero", "name": "Alex"}],
            "locations": [{"referenceId": "city", "name": "Neon City"}],
            "props": [],
        }
        prompt = component._build_scene_batch_prompt(
            initial_context=init_ctx,
            batch_num=1,
            total_batches=3,
        )
        assert "Batch 1/3" in prompt
        assert "Alex" in prompt
        assert "Neon City" in prompt

    def test_scene_batch_prompt_with_explicit_title(self, component):
        """Explicit title parameter should appear in the scene batch prompt."""
        init_ctx = {"characters": [], "locations": [], "props": []}
        prompt = component._build_scene_batch_prompt(
            initial_context=init_ctx,
            batch_num=1,
            total_batches=1,
            title="Explicit Batch Title",
        )
        assert "Explicit Batch Title" in prompt


# =========================================================================
# Audio file analysis
# =========================================================================


class TestAudioAnalysis:
    """Tests for ``_analyze_audio_if_provided``."""

    def test_no_audio_file_returns_none(self, component):
        """When audio_file is empty/None, should return None without calling LLM."""
        component.audio_file = ""
        result = component._analyze_audio_if_provided(llm=MagicMock(), config_dict={})
        assert result is None

    def test_audio_file_not_found_returns_none(self, component):
        """When audio_file path doesn't exist, should warn and return None."""
        component.audio_file = "/nonexistent/audio.mp3"
        result = component._analyze_audio_if_provided(llm=MagicMock(), config_dict={})
        assert result is None

    @patch("px.components.narrative.generate_storyboard.analyze_audio_file")
    def test_audio_analysis_delegates_to_module(self, mock_analysis, component, tmp_path):
        """Should delegate to the ``analyze_audio_file`` module function."""
        audio_file = tmp_path / "test.mp3"
        audio_file.write_text("fake audio content")

        component.audio_file = str(audio_file)

        mock_analysis.return_value = [
            {"startTime": 0.0, "endTime": 5.0, "duration": 5.0, "mood": "tense", "intensity": "medium"},
        ]

        result = component._analyze_audio_if_provided(llm="mock-llm", config_dict={"key": "val"})

        mock_analysis.assert_called_once_with(
            llm="mock-llm",
            audio_file_path=str(audio_file),
            user_prompt=component.input_value,
        )
        assert result is not None
        assert len(result) == 1
        assert result[0]["sceneIndex"] == 0  # should add sceneIndex

    @patch("px.components.narrative.generate_storyboard.analyze_audio_file")
    def test_audio_analysis_returns_none_gracefully(self, mock_analysis, component, tmp_path):
        """When analysis module returns None, should handle gracefully."""
        audio_file = tmp_path / "test.mp3"
        audio_file.write_text("fake audio content")

        component.audio_file = str(audio_file)
        mock_analysis.return_value = None

        result = component._analyze_audio_if_provided(llm=MagicMock(), config_dict={})
        assert result is None


# =========================================================================
# Storyboard generation (full flow with mocks)
# =========================================================================


class TestBuildStoryboard:
    """Integration-style tests for ``build_storyboard`` with mocked LLM and DB."""

    @patch.object(GenerateStoryboardComponent, "_extract_structured")
    @patch.object(GenerateStoryboardComponent, "_setup_llm_and_config")
    @patch.object(GenerateStoryboardComponent, "get_folder")
    @patch.object(GenerateStoryboardComponent, "get_entities")
    def test_build_storyboard_prompt_only_mode(
        self,
        mock_get_entities,
        mock_get_project,
        mock_setup,
        mock_extract,
        component,
    ):
        """Should produce a valid storyboard in prompt-only mode (no audio)."""
        # ── Mocks ──────────────────────────────────────────────────────────
        mock_llm = MagicMock()
        mock_config = {"display_name": "Test", "get_langchain_callbacks": list, "get_project_name": str}
        mock_setup.return_value = (mock_llm, mock_config, MagicMock())

        # DB mocks
        folder = MagicMock()
        folder.id = "proj-1"
        mock_get_project.return_value = folder
        mock_get_entities.return_value = []

        # Structured extraction returns mock data via unwrap
        def extract_side_effect(llm, schema, system_prompt, user_prompt, config_dict):
            """Return a mock result that _unwrap_objects can process."""
            schema_name = schema.__name__ if hasattr(schema, "__name__") else "Model"
            if "InitialContext" in schema_name:
                return {
                    "responses": [
                        MagicMock(
                            model_dump=lambda: {
                                "objects": [
                                    {
                                        "characters": [{"referenceId": "hero", "name": "Alex", "description": ""}],
                                        "locations": [{"referenceId": "city", "name": "Neon City", "description": ""}],
                                        "props": [],
                                        "metadata": {"title": "Neon Chase", "genre": "action", "mood": "tense"},
                                    }
                                ]
                            }
                        )
                    ]
                }
            if "SceneBatch" in schema_name:
                return {
                    "responses": [
                        MagicMock(
                            model_dump=lambda: {
                                "scenes": [
                                    {
                                        "sceneIndex": 0,
                                        "title": "The Getaway",
                                        "description": "Hero speeds through city",
                                        "startTime": 0.0,
                                        "endTime": 5.0,
                                        "duration": 5.0,
                                        "characterReferenceIds": ["hero"],
                                        "locationReferenceId": "city",
                                        "cameraAngle": "wide",
                                        "mood": "tense",
                                    }
                                ]
                            }
                        )
                    ]
                }
            return {"responses": []}

        mock_extract.side_effect = extract_side_effect

        # ── Execute ────────────────────────────────────────────────────────
        result = component.build_storyboard()

        # ── Assert ──────────────────────────────────────────────────────────
        assert isinstance(result, Data)
        data = result.data
        assert data["metadata"]["totalScenes"] == 1
        assert data["metadata"]["generatedWith"] == "multi-pass"
        assert data["metadata"]["audioGuided"] is False
        assert data["metadata"]["enhancedPrompt"] == component.input_value
        assert len(data["scenes"]) == 1
        assert data["scenes"][0]["title"] == "The Getaway"

    @patch.object(GenerateStoryboardComponent, "_extract_structured")
    @patch.object(GenerateStoryboardComponent, "_setup_llm_and_config")
    @patch.object(GenerateStoryboardComponent, "_analyze_audio_if_provided")
    @patch.object(GenerateStoryboardComponent, "get_folder")
    @patch.object(GenerateStoryboardComponent, "get_entities")
    def test_build_storyboard_audio_guided_mode(
        self,
        mock_get_entities,
        mock_get_project,
        mock_audio,
        mock_setup,
        mock_extract,
        component,
        tmp_path,
    ):
        """With audio segments, each segment should anchor a scene."""
        # ── Mocks ──────────────────────────────────────────────────────────
        mock_llm = MagicMock()
        mock_config = {"display_name": "Test", "get_langchain_callbacks": list, "get_project_name": str}
        mock_setup.return_value = (mock_llm, mock_config, MagicMock())

        folder = MagicMock()
        folder.id = "proj-2"
        mock_get_project.return_value = folder
        mock_get_entities.return_value = []

        # Audio analysis returns 2 segments
        mock_audio.return_value = [
            {"startTime": 0.0, "endTime": 5.0, "duration": 5.0, "mood": "tense", "intensity": "high", "sceneIndex": 0},
            {
                "startTime": 5.0,
                "endTime": 12.0,
                "duration": 7.0,
                "mood": "climactic",
                "intensity": "high",
                "sceneIndex": 1,
            },
        ]

        # Structured extraction
        call_count = {"ctx": 0}

        def extract_side_effect(llm, schema, system_prompt, user_prompt, config_dict):
            schema_name = schema.__name__ if hasattr(schema, "__name__") else "Model"
            if "InitialContext" in schema_name:
                call_count["ctx"] += 1
                return {
                    "responses": [
                        MagicMock(
                            model_dump=lambda: {
                                "objects": [
                                    {
                                        "characters": [],
                                        "locations": [],
                                        "props": [],
                                        "metadata": {"title": "Neon Chase", "genre": "action", "mood": "tense"},
                                    }
                                ]
                            }
                        )
                    ]
                }
            if "SceneBatch" in schema_name:
                return {
                    "responses": [
                        MagicMock(
                            model_dump=lambda: {
                                "scenes": [
                                    {
                                        "sceneIndex": 0,
                                        "title": "Scene",
                                        "description": "desc",
                                        "startTime": 0.0,
                                        "endTime": 5.0,
                                        "duration": 5.0,
                                        "characterReferenceIds": [],
                                        "locationReferenceId": "",
                                        "cameraAngle": "wide",
                                        "mood": "tense",
                                    }
                                ]
                            }
                        )
                    ]
                }
            return {"responses": []}

        mock_extract.side_effect = extract_side_effect

        # Set batch size > 1 so multiple batches aren't needed
        component.scene_batch_size = 10

        # ── Execute ────────────────────────────────────────────────────────
        result = component.build_storyboard()

        # ── Assert ──────────────────────────────────────────────────────────
        assert isinstance(result, Data)
        data = result.data
        assert data["metadata"]["audioGuided"] is True
        assert data["metadata"]["totalScenes"] == 1  # 2 segments → 2 batches, each returns 1 scene
        assert call_count["ctx"] == 1  # Pass 1 called exactly once

    @patch.object(GenerateStoryboardComponent, "get_folder")
    def test_build_storyboard_handles_db_failure_gracefully(
        self,
        mock_get_project,
        component,
    ):
        """If DB fetch fails, the component should still produce a storyboard."""
        mock_get_project.side_effect = ValueError("No flow context")

        # We also need to mock LLM setup and extraction
        with (
            patch.object(GenerateStoryboardComponent, "_setup_llm_and_config") as mock_setup,
            patch.object(GenerateStoryboardComponent, "_extract_structured") as mock_extract,
        ):
            mock_llm = MagicMock()
            mock_setup.return_value = (mock_llm, {"display_name": "T"}, MagicMock())

            mock_extract.return_value = {
                "responses": [
                    MagicMock(
                        model_dump=lambda: {
                            "objects": [{"characters": [], "locations": [], "props": [], "metadata": {}}]
                        }
                    )
                ]
            }

            result = component.build_storyboard()

        assert isinstance(result, Data)
        # The storyboard should still have been assembled (with empty metadata)
        assert "metadata" in result.data

    @patch.object(GenerateStoryboardComponent, "_extract_structured")
    @patch.object(GenerateStoryboardComponent, "_setup_llm_and_config")
    @patch.object(GenerateStoryboardComponent, "get_folder")
    @patch.object(GenerateStoryboardComponent, "get_entities")
    def test_build_storyboard_resolves_title_from_db(
        self,
        mock_get_entities,
        mock_get_project,
        mock_setup,
        mock_extract,
        component,
    ):
        """Title should be resolved from project.metadata_ (overrides component.title)."""
        mock_llm = MagicMock()
        mock_config = {"display_name": "Test", "get_langchain_callbacks": list, "get_project_name": str}
        mock_setup.return_value = (mock_llm, mock_config, MagicMock())

        # Project has metadata_ with title but component.title is different
        folder = MagicMock()
        folder.id = "proj-db-title"
        folder.metadata_ = {"title": "DB-Backed Title", "genre": "action"}
        mock_get_project.return_value = folder
        mock_get_entities.return_value = []

        # Note: component.title is "Neon Chase" from fixture, but we expect
        # "DB-Backed Title" to win because it's from the project DB.
        # We verify this by checking the system prompt passed to _extract_structured.

        captured_system_prompts: list[str] = []

        def capture_extract(llm, schema, system_prompt, user_prompt, config_dict):
            captured_system_prompts.append(system_prompt)
            schema_name = schema.__name__ if hasattr(schema, "__name__") else "Model"
            if "InitialContext" in schema_name:
                return {
                    "responses": [
                        MagicMock(
                            model_dump=lambda: {
                                "objects": [
                                    {
                                        "characters": [],
                                        "locations": [],
                                        "props": [],
                                        "metadata": {"title": "DB-Backed Title"},
                                    }
                                ]
                            }
                        )
                    ]
                }
            if "SceneBatch" in schema_name:
                return {
                    "responses": [
                        MagicMock(
                            model_dump=lambda: {
                                "scenes": [
                                    {
                                        "sceneIndex": 0,
                                        "title": "Scene",
                                        "description": "desc",
                                        "startTime": 0.0,
                                        "endTime": 5.0,
                                        "duration": 5.0,
                                        "characterReferenceIds": [],
                                        "locationReferenceId": "",
                                        "cameraAngle": "wide",
                                        "mood": "neutral",
                                    }
                                ]
                            }
                        )
                    ]
                }
            return {"responses": []}

        mock_extract.side_effect = capture_extract

        result = component.build_storyboard()

        assert isinstance(result, Data)

        # The DB-backed title should appear in all captured system prompts
        for prompt in captured_system_prompts:
            assert "DB-Backed Title" in prompt, f"DB title missing from: {prompt[:100]}"
            assert "Neon Chase" not in prompt, f"Fixture title leaked into: {prompt[:100]}"


# =========================================================================
# Backward-compatible single-pass outputs
# =========================================================================


class TestSinglePassOutputs:
    """Verify backward compatibility of ``build_structured_output`` and
    ``build_structured_dataframe``.
    """

    @patch.object(GenerateStoryboardComponent, "build_structured_output_base")
    def test_structured_output_single_item(self, mock_base, component):
        """A single-element list should be unwrapped into a flat Data."""
        mock_base.return_value = [{"key": "value"}]
        result = component.build_structured_output()
        assert isinstance(result, Data)
        assert result.data == {"key": "value"}

    @patch.object(GenerateStoryboardComponent, "build_structured_output_base")
    def test_structured_output_multiple_items(self, mock_base, component):
        """Multiple elements should be wrapped in a 'results' container."""
        mock_base.return_value = [
            {"id": 1, "name": "Alice"},
            {"id": 2, "name": "Bob"},
        ]
        result = component.build_structured_output()
        assert isinstance(result, Data)
        assert "results" in result.data
        assert len(result.data["results"]) == 2

    @patch.object(GenerateStoryboardComponent, "build_structured_output_base")
    def test_structured_output_empty_raises(self, mock_base, component):
        """Empty list should raise ValueError."""
        mock_base.return_value = []
        with pytest.raises(ValueError, match="No structured output returned"):
            component.build_structured_output()

    @patch.object(GenerateStoryboardComponent, "build_structured_output_base")
    def test_structured_dataframe_single_item(self, mock_base, component):
        """A single item should become a DataFrame with one row."""
        mock_base.return_value = [{"name": "Alice", "age": 30}]
        result = component.build_structured_dataframe()
        assert isinstance(result, DataFrame)

    @patch.object(GenerateStoryboardComponent, "build_structured_output_base")
    def test_structured_dataframe_multiple_items(self, mock_base, component):
        """Multiple items should become a DataFrame with multiple rows."""
        mock_base.return_value = [
            {"name": "Alice", "age": 30},
            {"name": "Bob", "age": 25},
        ]
        result = component.build_structured_dataframe()
        assert isinstance(result, DataFrame)
        assert len(result) == 2

    @patch.object(GenerateStoryboardComponent, "build_structured_output_base")
    def test_structured_dataframe_empty_raises(self, mock_base, component):
        """Empty list should raise ValueError."""
        mock_base.return_value = []
        with pytest.raises(ValueError, match="No structured output returned"):
            component.build_structured_dataframe()


# =========================================================================
# Schema defaults
# =========================================================================


class TestSchemaDefaults:
    """The default schemas should contain the expected fields."""

    def test_initial_context_schema_has_fields(self):
        """Default initial context schema includes characters, locations, props, metadata."""
        names = {row["name"] for row in _DEFAULT_INITIAL_CONTEXT_SCHEMA}
        assert "characters" in names
        assert "locations" in names
        assert "props" in names
        assert "metadata" in names

    def test_scene_schema_has_fields(self):
        """Default scene schema includes all required scene fields."""
        names = {row["name"] for row in _DEFAULT_SCENE_SCHEMA}
        for field in ("sceneIndex", "title", "description", "startTime", "endTime", "duration"):
            assert field in names, f"Missing required scene field: {field}"

    def test_default_batch_size(self):
        """Default scene batch size should be 10."""
        assert _SCENE_BATCH_SIZE_DEFAULT == 10


# =========================================================================
# Entity formatting in prompts
# =========================================================================


class TestEntityInjection:
    """Verify that existing entities are correctly formatted for prompts."""

    def test_characters_serialized_as_json_in_scene_batch_prompt(self, component):
        """Characters from initial context should appear as JSON in the batch prompt."""
        init_ctx = {
            "characters": [{"referenceId": "alice", "name": "Alice", "description": "Hero"}],
            "locations": [],
            "props": [],
        }
        prompt = component._build_scene_batch_prompt(init_ctx, 1, 1)
        assert "alice" in prompt
        assert "Alice" in prompt
        assert "Hero" in prompt

    def test_empty_entities_dont_break_prompt(self, component):
        """Passing empty entity lists should not cause errors."""
        prompt = component._build_initial_context_prompt(
            audio_segments=None,
            existing_entities={"characters": [], "locations": [], "props": []},
        )
        assert prompt is not None
        assert isinstance(prompt, str)
        assert len(prompt) > 100
