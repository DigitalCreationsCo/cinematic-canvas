"""Generate Storyboard - Langflow Component.

Multi-pass storyboard generation with optional audio analysis support.
Project-aware: fetches existing characters, locations, and props from the
NAP universe to inform storyboard generation.

Gen3 Architecture
-----------------
Narrative state comes from NAP manifests (via ``NapService``/``BaseStateAwareComponent``).
Project metadata (title, settings) comes from Folder, which remains Portals-owned.
All SQL/ORM access for narrative entities has been removed.

Execution flow (build_storyboard)
----------------------------------
  Pass 1  - Generate initial context: characters, locations, props, metadata.
            Existing NAP entities are injected into the prompt so the LLM
            extends (rather than duplicates) what was previously authored.
  Pass 2+ - Generate scenes in batches:
               * Audio-guided mode: each audio segment is a scene anchor.
               * Prompt-only mode: a single open-ended slot lets the LLM
                 determine the scene count from the narrative.

Key changes vs earlier versions
--------------------------------
  * Inherits ``BaseStateAwareComponent`` for both project and NAP context.
  * Passes pre-existing characters / locations / props from NAP manifests
    into the generation prompt.
  * Project title is resolved from ``folder.metadata.title`` with fallback
    to the component ``title`` input for backward compatibility.
  * Uses ``StoryboardManager`` (copy-modify-write merge) to merge the
    generated storyboard, ensuring no properties are accidentally excluded.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field, create_model
from trustcall import create_extractor

from px.base.agents.token_callback import TokenUsageCallbackHandler
from px.base.models.chat_result import get_chat_result
from px.base.models.unified_models import get_llm, handle_model_input_update
from px.base.narrative.audio_analysis import analyze_audio_file
from px.base.prompts.storyboard_initial_context import build_initial_context_prompt
from px.base.prompts.storyboard_scene_batch import build_scene_batch_prompt
from px.base.prompts.storyboard_vision_prompt import build_storyboard_vision_prompt
from px.components.llm_operations.structured_output import StructuredOutputComponent
from px.components.narrative.base_state_aware import BaseStateAwareComponent
from px.components.narrative.storyboard_manager import StoryboardManager
from px.field_typing.range_spec import RangeSpec
from px.helpers.base_model import build_model_from_schema
from px.helpers.llm_json_tolerance import (
    coerce_json_string,
    make_json_tolerant,
    tolerant_list_field,
)
from px.inputs.inputs import BoolInput
from px.io import (
    FileInput,
    IntInput,
    MessageTextInput,
    ModelInput,
    MultilineInput,
    Output,
    SecretStrInput,
    SliderInput,
    TableInput,
)
from px.log.logger import logger
from px.schema.data import Data
from px.schema.table import EditMode

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

_SCENE_BATCH_SIZE_DEFAULT: int = 10

# Audio file types supported by the FileInput.
_AUDIO_FILE_TYPES: list[str] = ["mp3", "wav"]

# Reusable table-column definition shared by the three schema TableInputs.
_SCHEMA_TABLE_COLUMNS: list[dict] = [
    {
        "name": "name",
        "display_name": "Name",
        "type": "str",
        "description": "Field name.",
        "default": "field",
        "edit_mode": EditMode.INLINE,
    },
    {
        "name": "description",
        "display_name": "Description",
        "type": "str",
        "description": "Field description.",
        "default": "",
        "edit_mode": EditMode.POPOVER,
    },
    {
        "name": "type",
        "display_name": "Type",
        "type": "str",
        "edit_mode": EditMode.INLINE,
        "description": "Data type (str, int, float, bool, dict).",
        "options": ["str", "int", "float", "bool", "dict"],
        "default": "str",
    },
    {
        "name": "multiple",
        "display_name": "As List",
        "type": "boolean",
        "description": "True if this field should be a list of the specified type.",
        "default": "False",
        "edit_mode": EditMode.INLINE,
    },
]

# Defaults for the two new multi-pass schemas.
_DEFAULT_INITIAL_CONTEXT_SCHEMA: list[dict] = [
    {
        "name": "characters",
        "description": "Named individuals — each with referenceId, name, description, and traits.",
        "type": "dict",
        "multiple": "True",
    },
    {
        "name": "locations",
        "description": "Distinct settings — each with referenceId, name, and description.",
        "type": "dict",
        "multiple": "True",
    },
    {
        "name": "props",
        "description": "Key physical objects central to the narrative.",
        "type": "dict",
        "multiple": "True",
    },
    {
        "name": "metadata",
        "description": "Storyboard metadata: title, genre, mood, tone, logline, duration estimate.",
        "type": "dict",
        "multiple": "False",
    },
]

_DEFAULT_SCENE_SCHEMA: list[dict] = [
    {"name": "sceneIndex", "description": "Zero-based scene index.", "type": "int", "multiple": "False"},
    {"name": "title", "description": "Short descriptive title for the scene.", "type": "str", "multiple": "False"},
    {
        "name": "description",
        "description": "Full visual and narrative description of the scene.",
        "type": "str",
        "multiple": "False",
    },
    {
        "name": "startTime",
        "description": "Scene start time in seconds (preserved exactly from audio segments).",
        "type": "float",
        "multiple": "False",
    },
    {
        "name": "endTime",
        "description": "Scene end time in seconds (preserved exactly from audio segments).",
        "type": "float",
        "multiple": "False",
    },
    {"name": "duration", "description": "Scene duration in seconds.", "type": "float", "multiple": "False"},
    {
        "name": "characterReferenceIds",
        "description": "ReferenceIds of characters appearing in this scene.",
        "type": "str",
        "multiple": "True",
    },
    {
        "name": "locationReferenceId",
        "description": "ReferenceId of the scene's primary location.",
        "type": "str",
        "multiple": "False",
    },
    {
        "name": "cameraAngle",
        "description": "Suggested camera angle or shot type (e.g. wide shot, close-up, OTS).",
        "type": "str",
        "multiple": "False",
    },
    {"name": "mood", "description": "Emotional tone or atmosphere of the scene.", "type": "str", "multiple": "False"},
]


class GenerateStoryboardComponent(BaseStateAwareComponent, StructuredOutputComponent):
    display_name = "Generate Storyboard"
    name = "GenerateStoryboard"
    description = (
        "Generates a structured storyboard via multi-pass LLM calls. "
        "Pass 1 builds initial context (characters, locations, props, metadata). "
        "Pass 2+ generates scenes in batches, optionally guided by audio-analysis segments. "
        "Single-pass structured output retained for backward compatibility. "
        "Project-aware: fetches existing characters, locations, and props from the NAP universe."
    )
    icon = "sparkles"
    documentation: str = "https://docs.portals.org/components-models"
    category = "models"

    # Preserved as None; actual value computed at runtime by build_system_prompt().
    system_prompt: str | None = None

    inputs = [
        # ── Core ──────────────────────────────────────────────────────────────
        ModelInput(
            name="model",
            display_name="Language Model",
            info="Select your model provider.",
            real_time_refresh=True,
            required=True,
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            info="Overrides global provider settings. Leave blank to use your pre-configured API Key.",
            real_time_refresh=True,
            advanced=True,
        ),
        MultilineInput(
            name="input_value",
            display_name="Input Message",
            info="The creative prompt used to generate the storyboard.",
            tool_mode=True,
            required=True,
        ),
        MessageTextInput(
            name="title",
            display_name="Title",
            info="Title of the project.",
        ),
        # ── Audio File ────────────────────────────────────────────────────────
        FileInput(
            name="audio_file",
            display_name="Audio File",
            info=(
                "Optional. When provided, the LLM analyses the audio "
                "in the context of your narrative prompt and produces "
                "timed segments that anchor scene generation. "
                "Supports mp3, wav, m4a, flac, ogg, aac."
            ),
            file_types=_AUDIO_FILE_TYPES,
            required=False,
        ),
        MessageTextInput(
            name="project_id",
            display_name="Project ID",
            info=(
                "Optional. When set, the assembled storyboard is also persisted "
                "to the project database via project_repository."
            ),
            required=False,
            advanced=True,
        ),
        IntInput(
            name="scene_batch_size",
            display_name="Scene Batch Size",
            value=_SCENE_BATCH_SIZE_DEFAULT,
            info="Number of scene slots processed per LLM call during Pass 2+ (audio-guided mode).",
            advanced=True,
            range_spec=RangeSpec(min=1, max=50, step=1, step_type="int"),
        ),
        # ── Schemas ───────────────────────────────────────────────────────────
        MessageTextInput(
            name="schema_name",
            display_name="Schema Name",
            info="Name for the single-pass output schema.",
            advanced=True,
        ),
        TableInput(
            name="output_schema",
            display_name="Output Schema",
            info=("Schema for single-pass structured output (used by Build Structured Output)."),
            required=True,
            table_schema=[
                {
                    "name": "name",
                    "display_name": "Name",
                    "type": "str",
                    "description": "Specify the name of the output field.",
                    "default": "field",
                    "edit_mode": EditMode.INLINE,
                },
                {
                    "name": "description",
                    "display_name": "Description",
                    "type": "str",
                    "description": "Describe the purpose of the output field.",
                    "default": "description of field",
                    "edit_mode": EditMode.POPOVER,
                },
                {
                    "name": "type",
                    "display_name": "Type",
                    "type": "str",
                    "edit_mode": EditMode.INLINE,
                    "description": ("Indicate the data type of the output field (e.g., str, int, float, bool, dict)."),
                    "options": ["str", "int", "float", "bool", "dict"],
                    "default": "str",
                },
                {
                    "name": "multiple",
                    "display_name": "As List",
                    "type": "boolean",
                    "description": "Set to True if this output field should be a list of the specified type.",
                    "default": "False",
                    "edit_mode": EditMode.INLINE,
                },
            ],
            value=[
                {
                    "name": "field",
                    "description": "description of field",
                    "type": "str",
                    "multiple": "False",
                }
            ],
        ),
        TableInput(
            name="initial_context_schema",
            display_name="Initial Context Schema",
            info=(
                "Schema for Pass 1 output (characters, locations, props, metadata). "
                "Used by Build Storyboard. Defaults cover the standard storyboard context fields."
            ),
            required=False,
            advanced=True,
            table_schema=_SCHEMA_TABLE_COLUMNS,
            value=_DEFAULT_INITIAL_CONTEXT_SCHEMA,
        ),
        TableInput(
            name="scene_schema",
            display_name="Scene Schema",
            info=(
                "Schema for individual scene objects generated in Pass 2+. "
                "Used by Build Storyboard. Defaults cover standard scene fields "
                "(timing, characters, location, camera, mood)."
            ),
            required=False,
            advanced=True,
            table_schema=_SCHEMA_TABLE_COLUMNS,
            value=_DEFAULT_SCENE_SCHEMA,
        ),
        # ── LLM tuning ────────────────────────────────────────────────────────
        BoolInput(
            name="stream",
            display_name="Stream",
            info="Whether to stream the response.",
            value=False,
            advanced=True,
        ),
        SliderInput(
            name="temperature",
            display_name="Temperature",
            value=0.5,
            info="Controls randomness in responses.",
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            advanced=True,
        ),
        IntInput(
            name="max_tokens",
            display_name="Max Tokens",
            info="Maximum number of tokens to generate. Field name varies by provider.",
            advanced=True,
            range_spec=RangeSpec(min=1, max=128000, step=1, step_type="int"),
        ),
    ]

    outputs = [
        Output(
            display_name="Storyboard",
            name="storyboard",
            method="build_storyboard",
            types=["Data"],
        ),
        Output(
            display_name="Structured Output",
            name="structured_output",
            method="build_structured_output",
        ),
    ]

    # =========================================================================
    # CONFIG UPDATE
    # =========================================================================

    def update_build_config(self, build_config: dict, field_value: str, field_name: str | None = None):
        """Dynamically update build config with user-filtered model options."""
        return handle_model_input_update(self, build_config, field_value, field_name)

    # =========================================================================
    # SHARED INTERNAL HELPERS
    # =========================================================================

    def _analyze_audio_if_provided(self, llm: Any, config_dict: dict) -> list | None:
        """If ``audio_file`` is set, run multimodal analysis and return segments.

        The caller's configured ``llm`` is passed through to
        ``analyze_audio_file`` unchanged — the analysis always uses the
        component's model, never reaching into provider-specific libraries.

        The returned segment list is compatible with the existing audio-guided
        scene-generation path (same dict keys as the old ``audio_segments_json``).

        ``config_dict`` is accepted for forward-compatibility with caller
        signatures but not consumed here.
        """
        audio_path: str | None = getattr(self, "audio_file", None)
        if not audio_path:
            return None

        if not Path(audio_path).exists():
            logger.warning(f"audio_file path does not exist: {audio_path}")
            return None

        logger.info(f"Audio file provided: {audio_path}")
        segments = analyze_audio_file(
            llm=llm,
            audio_file_path=audio_path,
            user_prompt=self.input_value,
        )
        if segments is None:
            logger.info("Audio analysis returned no segments — proceeding in prompt-only mode.")
            return None

        # Add sceneIndex to each segment for downstream compatibility
        for i, seg in enumerate(segments):
            seg["sceneIndex"] = i

        logger.info(f"Audio analysis produced {len(segments)} segment(s).")
        return segments

    def _setup_llm_and_config(self) -> tuple[Any, dict, TokenUsageCallbackHandler]:
        """Instantiate the LLM and build a tracing config dict.

        A fresh TokenUsageCallbackHandler is injected into the callbacks chain.
        Mirrors the setup pattern used in build_structured_output_base.
        """
        llm = get_llm(model=self.model, user_id=self.user_id, api_key=self.api_key)
        if not hasattr(llm, "with_structured_output"):
            msg = "Language model does not support structured output."
            raise TypeError(msg)

        token_handler = TokenUsageCallbackHandler()
        base_callbacks = self.get_langchain_callbacks()
        config_dict: dict = {
            "display_name": self.display_name,
            "get_project_name": self.get_project_name,
            "get_langchain_callbacks": lambda: [*base_callbacks, token_handler],
        }
        return llm, config_dict, token_handler

    def _build_wrapped_schema(
        self,
        schema_rows: list[dict],
        model_name: str,
        doc: str,
        key: str = "objects",
    ) -> type[BaseModel]:
        """Build a Pydantic model whose single field *key* is a non-empty list.

        The inner model is derived from *schema_rows*.

        The *key* defaults to ``"objects"`` (for ``build_structured_output_base``
        compatibility) but can be set to ``"scenes"`` or any other field name so
        that ``_unwrap_objects`` can consistently handle the result.

        Both the inner model's ``list``/``dict``-typed fields (e.g.
        ``characters``, ``locations``, ``metadata``) and the wrapper's *key*
        field itself are made tolerant of a JSON-encoded string standing in
        for the expected list/dict — some models (observed with Gemini)
        stringify one or the other inconsistently.
        """
        if not schema_rows:
            msg = f"Schema rows for '{model_name}' cannot be empty."
            raise ValueError(msg)
        inner = make_json_tolerant(build_model_from_schema(schema_rows))
        return create_model(
            model_name,
            __doc__=doc,
            **{  # type: ignore[arg-type]
                key: (
                    tolerant_list_field(inner),
                    Field(description=doc, min_length=1),
                )
            },
        )

    def _extract_structured(
        self,
        llm: Any,
        schema: type[BaseModel],
        system_prompt: str,
        user_prompt: str,
        config_dict: dict,
    ) -> Any:
        """Attempt structured extraction via Trustcall.

        Falls back to Langchain ``with_structured_output`` on failure.
        Raises ValueError if both fail.
        """
        # --- Trustcall ---
        try:
            runnable = create_extractor(llm, tools=[schema], tool_choice=schema.__name__)
            result = get_chat_result(
                runnable=runnable,
                system_message=system_prompt,
                input_value=user_prompt,
                config=config_dict,
            )
            if result and result.get("responses"):
                return result
            logger.warning(
                f"Trustcall returned no validated '{schema.__name__}' "
                f"after {result.get('attempts', '?') if result else '?'} attempt(s); "
                "falling back to Langchain."
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                f"Trustcall extraction failed ({exc!r}); falling back to Langchain. "
                "(Normal for models without native tool-calling support.)"
            )

        # --- Langchain fallback ---
        try:
            runnable = llm.with_structured_output(schema)
            return get_chat_result(
                runnable=runnable,
                system_message=system_prompt,
                input_value=user_prompt,
                config=config_dict,
            )
        except Exception as exc:
            msg = (
                f"Structured output extraction failed for '{schema.__name__}' "
                f"(trustcall + langchain both failed): {exc}"
            )
            raise ValueError(msg) from exc

    @staticmethod
    def _unwrap_objects(raw: Any, key: str = "objects") -> list[dict]:
        """Normalise an extraction result into a plain ``list[dict]``."""
        if raw is None:
            return []

        # Trustcall envelope
        if isinstance(raw, dict) and "responses" in raw:
            responses = raw.get("responses") or []
            if not responses:
                logger.warning(
                    f"Trustcall envelope had no validated responses "
                    f"(attempts={raw.get('attempts')}) — returning no items."
                )
                return []
            first = responses[0]
            # Protect against 'first' already being a dict
            raw = first.model_dump() if isinstance(first, BaseModel) else first

        # Wrapper dict (from _build_wrapped_schema)
        if isinstance(raw, dict):
            raw = raw.get(key, raw.get("objects", raw))

        # Single BaseModel (langchain fallback)
        if isinstance(raw, BaseModel):
            raw = raw.model_dump()
            raw = raw.get(key, raw.get("objects", raw))

        # Normalise list elements
        if isinstance(raw, list):
            return [item.model_dump() if isinstance(item, BaseModel) else item for item in raw]

        # If the LLM returned a single unwrapped dictionary, wrap it
        if isinstance(raw, dict):
            return [raw]

        return []

    # =========================================================================
    # AUDIO TIMING PRESERVATION
    # =========================================================================

    @staticmethod
    def _validate_audio_timing(
        original_segments: list[dict],
        enriched_scenes: list[dict],
    ) -> None:
        """Validate that enriched scenes preserve audio segment timings.

        When the storyboard is audio-guided, each audio segment anchors one
        scene.  This check verifies:

        * Scene count matches segment count.
        * Each scene's ``startTime`` and ``endTime`` match the original
          segment (within a small tolerance for floating-point drift).

        Non-fatal: all mismatches are logged as warnings so they are
        discoverable during debugging without aborting generation.
        """
        original_count = len(original_segments)
        enriched_count = len(enriched_scenes)

        if original_count != enriched_count:
            logger.warning(f"Audio timing: scene count mismatch — original={original_count}, enriched={enriched_count}")
            diff = abs(original_count - enriched_count)
            for i in range(diff):
                idx = min(original_count, enriched_count) + i
                logger.warning(f"Audio timing: orphaned scene at index {idx}")

        # Check each matching scene for timing drift
        for i in range(min(original_count, enriched_count)):
            orig = original_segments[i]
            enrich = enriched_scenes[i]

            orig_start = orig.get("startTime")
            orig_end = orig.get("endTime")
            enrich_start = enrich.get("startTime")
            enrich_end = enrich.get("endTime")

            if orig_start is not None and enrich_start is not None and orig_start != enrich_start:
                logger.warning(
                    f"Audio timing: startTime mismatch in scene {i} — original={orig_start}, enriched={enrich_start}"
                )
            if orig_end is not None and enrich_end is not None and orig_end != enrich_end:
                logger.warning(
                    f"Audio timing: endTime mismatch in scene {i} — original={orig_end}, enriched={enrich_end}"
                )

    # =========================================================================
    # MULTI-PASS GENERATION — PASS 1
    # =========================================================================

    def _generate_initial_context(
        self,
        llm: Any,
        config_dict: dict,
        audio_segments: list | None,
        existing_entities: dict[str, list[dict]] | None = None,
        title: str | None = None,
    ) -> dict:
        """Call the LLM to produce storyboard metadata, characters, locations, and props.

        Audio segments are included in the prompt when present to ground the context
        in the audio narrative. Existing NAP entities are included so the LLM extends
        rather than duplicates previously authored content.

        Parameters
        ----------
        title:
            Explicit project title forwarded to the prompt builder. Falls back to
            the component's ``self.title`` input when not provided.

        Returns a single context dict (first element of the wrapped objects list).
        """
        schema_rows = getattr(self, "initial_context_schema", None) or _DEFAULT_INITIAL_CONTEXT_SCHEMA
        schema = self._build_wrapped_schema(schema_rows, "InitialContextModel", "Initial storyboard context.")
        system_prompt = build_initial_context_prompt(self.input_value, audio_segments, existing_entities, title=title)

        if audio_segments:
            last = audio_segments[-1]
            total_dur = last.get("endTime", last.get("duration", "unknown"))
            user_prompt = (
                f"{self.input_value}\n\n"
                f"Audio context: {len(audio_segments)} segment(s), "
                f"total duration {total_dur}s.\n"
                "Generate initial context (characters, locations, props, metadata) only."
            )
        else:
            user_prompt = (
                f"{self.input_value}\n\n"
                "Generate initial context (characters, locations, props, metadata) only. "
                "Scene generation follows in the next pass."
            )

        raw = self._extract_structured(llm, schema, system_prompt, user_prompt, config_dict)
        items = self._unwrap_objects(raw)

        if not items:
            logger.warning("Pass 1 returned no items; continuing with empty initial context.")
            return {}

        first = items[0]
        return first if isinstance(first, dict) else {}

    # =========================================================================
    # MULTI-PASS GENERATION — PASS 2+
    # =========================================================================

    def _generate_scene_batch(
        self,
        llm: Any,
        config_dict: dict,
        initial_context: dict,
        scenes_to_process: list,
        batch_num: int,
        total_batches: int,
        prev_scene: dict | None,
        first_scene: dict | None,
        title: str | None = None,
    ) -> list[dict]:
        """Enrich one batch of scene slots using the established initial context.

        Continuity is maintained via the previous-scene and exposition (first-scene)
        signals appended to the user message.

        Parameters
        ----------
        title:
            Explicit project title forwarded to the prompt builder. Falls back to
            ``self.title`` when not provided.
        """
        scene_schema_rows = getattr(self, "scene_schema", None) or _DEFAULT_SCENE_SCHEMA
        scene_batch_schema = self._build_wrapped_schema(
            schema_rows=scene_schema_rows,
            model_name="SceneBatch",
            doc="A batch of enriched storyboard scenes.",
            key="scenes",
        )

        system_prompt = build_scene_batch_prompt(
            self.input_value, initial_context, schema=scene_batch_schema, title=title
        )

        # Build user message with continuity signals
        parts: list[str] = [f"Batch {batch_num}/{total_batches}"]
        if batch_num > 1 and first_scene:
            parts.append(f"Exposition (opening scene — for narrative coherence):\n{json.dumps(first_scene)}")
        if prev_scene:
            parts.append(f"Previous scene (for continuity):\n{json.dumps(prev_scene)}")
        parts.append(f"Scenes to enrich:\n{json.dumps(scenes_to_process)}")
        user_prompt = "\n\n".join(parts)

        raw = self._extract_structured(llm, scene_batch_schema, system_prompt, user_prompt, config_dict)
        return self._unwrap_objects(raw, key="scenes")

    # =========================================================================
    # OUTPUT — MULTI-PASS STORYBOARD
    # =========================================================================

    def build_storyboard(self) -> Data:
        """Multi-pass storyboard generation output.

        Flow:
          1. Get project title from Folder metadata (falls back to component
             ``title`` input for backward compatibility).
          2. Fetch existing entities from the NAP universe.
          3. If ``audio_file`` is provided, analyse it via multimodal LLM.
          4. Pass 1  — Generate initial context (characters, locations, props, metadata).
          5. Pass 2+ — Generate scenes in batches.
          6. Merge generated storyboard into the project Folder storyboard field.
          7. Assemble & return final storyboard.

        Returns:
            ``Data`` with the full storyboard payload.
        """
        llm, config_dict, token_handler = self._setup_llm_and_config()

        # ── Resolve project title and existing entities ────────────────
        project: Any | None = None
        project_id_db: str | None = None
        effective_title: str = ""
        existing_entities: dict[str, list[dict]] | None = None

        try:
            folder = self.get_folder()
            if folder is None:
                logger.warning("No project state available. Proceeding without project context.")
                effective_title = getattr(self, "title", "") or ""
            else:
                project_id_db = str(folder.id)
                project = folder  # Keep for backward compat in persistence step

                # Extract title from project metadata (authoritative source).
                raw_meta = getattr(folder, "metadata_", None) or {}
                project_metadata = raw_meta if isinstance(raw_meta, dict) else {}
                project_title = project_metadata.get("title", "") or ""
                manual_title = getattr(self, "title", "") or ""
                effective_title = project_title or manual_title

                # Load existing entities from NAP universe (not SQL)
                try:
                    existing_entities = {
                        "characters": self.get_entities("character"),
                        "locations": self.get_entities("location"),
                        "props": self.get_entities("prop"),
                    }
                except Exception as exc:
                    logger.warning(f"Could not load entities from NAP universe ({exc!r}). Proceeding without context.")
                    existing_entities = {"characters": [], "locations": [], "props": []}

                logger.info(
                    "Loaded project state from NAP universe | "
                    f"project='{project_id_db}', "
                    f"title='{effective_title}', "
                    f"characters={len(existing_entities.get('characters', []))}, "
                    f"locations={len(existing_entities.get('locations', []))}, "
                    f"props={len(existing_entities.get('props', []))}"
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"Could not load project state ({exc!r}). Proceeding without project context.")
            effective_title = getattr(self, "title", "") or ""

        # ── Analyse audio if provided ──────────────────────────────────
        audio_segments = self._analyze_audio_if_provided(llm, config_dict)
        batch_size: int = getattr(self, "scene_batch_size", _SCENE_BATCH_SIZE_DEFAULT)

        logger.info(
            "Starting multi-pass storyboard generation | "
            f"title='{effective_title}', "
            f"audio_segments={len(audio_segments) if audio_segments else 0}, "
            f"batch_size={batch_size}"
        )

        # ── Pass 1: Initial Context ──────────────────────────────────────
        logger.info("Pass 1: generating initial context (characters, locations, props, metadata)…")
        initial_context = self._generate_initial_context(
            llm,
            config_dict,
            audio_segments,
            existing_entities,
            title=effective_title,
        )
        logger.info(
            "Pass 1 complete | "
            f"characters={len(initial_context.get('characters', []))}, "
            f"locations={len(initial_context.get('locations', []))}, "
            f"props={len(initial_context.get('props', []))}"
        )

        # ── Pass 2+: Scene Generation ─────────────────────────────────────
        if audio_segments:
            # Audio-guided: every audio segment becomes a scene anchor.
            scenes_source = audio_segments
            mode = "audio-guided"
        else:
            # Prompt-only: one open-ended slot; the LLM determines scene count.
            scenes_source = [
                {
                    "sceneIndex": 0,
                    "instruction": (
                        "Generate all scenes for the complete storyboard. "
                        "Determine the appropriate scene count from the narrative."
                    ),
                }
            ]
            mode = "prompt-only"

        total_source = len(scenes_source)
        total_batches = max(1, -(-total_source // batch_size))  # ceiling division

        logger.info(f"Pass 2+ ({mode}): {total_source} source slot(s) → {total_batches} batch(es) of ≤{batch_size}")

        all_scenes: list[dict] = []
        first_scene: dict | None = scenes_source[0] if scenes_source else None

        for batch_idx in range(total_batches):
            start = batch_idx * batch_size
            end = min(start + batch_size, total_source)
            batch = scenes_source[start:end]
            batch_num = batch_idx + 1
            prev_scene = all_scenes[-1] if all_scenes else None

            logger.info(f"  Batch {batch_num}/{total_batches}: processing {len(batch)} slot(s)…")
            batch_scenes = self._generate_scene_batch(
                llm=llm,
                config_dict=config_dict,
                initial_context=initial_context,
                scenes_to_process=batch,
                batch_num=batch_num,
                total_batches=total_batches,
                prev_scene=prev_scene,
                first_scene=first_scene,
                title=effective_title,
            )
            all_scenes.extend(batch_scenes)
            logger.info(f"  Batch {batch_num}/{total_batches} complete — running total: {len(all_scenes)} scene(s)")

        # Re-index scenes sequentially
        for i, scene in enumerate(all_scenes):
            if isinstance(scene, dict):
                scene["sceneIndex"] = i

        # ── Audio timing preservation check ─────────────────────────────
        if audio_segments:
            self._validate_audio_timing(audio_segments, all_scenes)

        # ── Assemble final storyboard ────────────────────────────────────
        last_scene = all_scenes[-1] if all_scenes else {}
        storyboard = {
            **initial_context,
            "scenes": all_scenes,
            "metadata": {
                **(initial_context.get("metadata") or {}),
                "totalScenes": len(all_scenes),
                "generatedWith": "multi-pass",
                "audioGuided": audio_segments is not None,
                "duration": last_scene.get("endTime", last_scene.get("duration", 0)),
                "enhancedPrompt": self.input_value,
            },
        }

        self._token_usage = token_handler.get_usage()
        logger.info(f"Multi-pass generation complete — scenes={len(all_scenes)}, token_usage={self._token_usage}")

        # Persist to project folder (via ProjectService, not SQL entity tables)
        if project:
            try:
                self.ingest_storyboard_to_database(project_id_db, storyboard)
            except Exception as exc:
                # Log non-fatal error to ensure component still yields data
                logger.error(f"Non-fatal: Database ingestion failed for project '{project_id_db}'. Root cause: {exc}")

        return Data(data=storyboard)

    # =========================================================================
    # OUTPUT — SINGLE-PASS (backward compatible, unchanged behaviour)
    # =========================================================================

    def build_system_prompt(self) -> str:
        """Compute and return the system prompt for single-pass generation.

        Also exposed as a component output so downstream nodes can inspect it.
        """
        return build_storyboard_vision_prompt(title=self.title or "", user_prompt=self.input_value)

    def build_structured_output_base(self):
        schema_name = self.schema_name or "OutputModel"

        llm = get_llm(model=self.model, user_id=self.user_id, api_key=self.api_key)

        if not hasattr(llm, "with_structured_output"):
            msg = "Language model does not support structured output."
            raise TypeError(msg)
        if not self.output_schema:
            msg = "Output schema cannot be empty"
            raise ValueError(msg)

        output_model_ = make_json_tolerant(build_model_from_schema(self.output_schema))
        output_model = create_model(
            schema_name,
            __doc__=f"A list of {schema_name}.",
            objects=(
                tolerant_list_field(output_model_),
                Field(
                    description=f"A list of {schema_name}.",  # type: ignore[valid-type]
                    min_length=1,
                ),
            ),
        )
        # Tracing config with token usage handler injected into the callbacks chain.
        token_handler = TokenUsageCallbackHandler()
        base_callbacks = self.get_langchain_callbacks()
        config_dict = {
            "display_name": self.display_name,
            "get_project_name": self.get_project_name,
            "get_langchain_callbacks": lambda: [*base_callbacks, token_handler],
        }
        # Generate structured output using Trustcall first, then fallback to Langchain if it fails
        result = self._extract_output_with_trustcall(llm, output_model, config_dict)
        if result is None:
            raw_result = self._extract_output_with_langchain(llm, output_model, config_dict)
            result = self.sanitize_llm_output(raw_result)
        self._token_usage = token_handler.get_usage()

        # OPTIMIZATION NOTE: Simplified processing based on trustcall response structure
        if not isinstance(result, dict):
            return result

        # Extract first response and convert BaseModel to dict
        responses = result.get("responses", [])
        if not responses:
            return result

        # Convert BaseModel to dict (creates the "objects" key)
        first_response = responses[0]
        structured_data = first_response
        if isinstance(first_response, BaseModel):
            structured_data = first_response.model_dump()
        # Extract the objects array
        return structured_data.get("objects", structured_data)

    def build_structured_output(self) -> Data:
        output = self.build_structured_output_base()
        if not isinstance(output, list) or not output:
            msg = "No structured output returned"
            raise ValueError(msg)
        if len(output) == 1:
            return Data(data=output[0])
        if len(output) > 1:
            return Data(data={"results": output})
        return Data()

    def _extract_output_with_trustcall(self, llm, schema: BaseModel, config_dict: dict) -> list[BaseModel] | None:
        _system_prompt = self.build_system_prompt()
        try:
            llm_with_structured_output = create_extractor(llm, tools=[schema], tool_choice=schema.__name__)
            result = get_chat_result(
                runnable=llm_with_structured_output,
                system_message=_system_prompt,
                input_value=self.input_value,
                config=config_dict,
            )
        except Exception as e:  # noqa: BLE001
            logger.warning(
                f"Trustcall extraction failed, falling back to Langchain: {e} "
                "(Note: This may not be an error—some models or configurations "
                "do not support tool calling. "
                "Falling back is normal in such cases.)"
            )
            return None
        if not result or not result.get("responses"):
            logger.warning(
                f"Trustcall returned no validated '{schema.__name__}' "
                f"after {result.get('attempts', '?') if result else '?'} attempt(s); "
                "falling back to Langchain."
            )
            return None
        return result

    def _extract_output_with_langchain(self, llm, schema: BaseModel, config_dict: dict) -> list[BaseModel] | None:
        _system_prompt = self.build_system_prompt()
        try:
            llm_with_structured_output = llm.with_structured_output(schema)
            result = get_chat_result(
                runnable=llm_with_structured_output,
                system_message=_system_prompt,
                input_value=self.input_value,
                config=config_dict,
            )
            if isinstance(result, BaseModel):
                result = result.model_dump()
                result = result.get("objects", result)
        except Exception as fallback_error:
            msg = (
                f"Model does not support tool calling (trustcall failed) "
                f"and fallback with_structured_output also failed: {fallback_error}"
            )
            raise ValueError(msg) from fallback_error

        return result or None

    def sanitize_llm_output(self, data):
        """Recursively look for stringified lists/dicts and parse them into
        native Python types.

        Defense-in-depth alongside ``make_json_tolerant`` (used to build the
        schemas passed to trustcall/``with_structured_output``): that helper
        fixes validation up front so the *first* attempt succeeds, but this
        remains useful for the Langchain ``with_structured_output`` fallback
        path.
        """
        if isinstance(data, dict):
            for key, value in data.items():
                if isinstance(value, str):
                    decoded = coerce_json_string(value)
                    if decoded is not value:
                        data[key] = decoded
                        self.sanitize_llm_output(decoded)
                elif isinstance(value, (dict, list)):
                    self.sanitize_llm_output(value)
        elif isinstance(data, list):
            for item in data:
                self.sanitize_llm_output(item)
        return data
