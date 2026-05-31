"""Generate Storyboard - Langflow Component.

Multi-pass storyboard generation with optional audio analysis support.

Execution flow (build_storyboard)
---------------------------------
  Pass 1  - Generate initial context: characters, locations, props, metadata.
  Pass 2+ - Generate scenes in batches:
               * Audio-guided mode: each audio segment is a scene anchor.
               * Prompt-only mode: a single open-ended slot lets the LLM
                 determine the scene count from the narrative.

Single-pass outputs (build_structured_output / build_structured_dataframe)
are retained unchanged for backward compatibility.

Bug fixes vs. original
-----------------------
  * build_system_prompt: added missing `return`; replaced undefined `project`
    with graceful fallback to `self.title or ""`.
  * system_prompt class attribute: was called as an unbound method at class
    definition time (TypeError); replaced with `None` and computed at runtime
    inside _extract_output_with_trustcall / _extract_output_with_langchain.
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, create_model
from trustcall import create_extractor

from px.base.agents.token_callback import TokenUsageCallbackHandler
from px.base.models.chat_result import get_chat_result
from px.base.models.unified_models import get_llm, handle_model_input_update
from px.base.prompts.storyboard_vision_prompt import build_storyboard_vision_prompt
from px.components.llm_operations.structured_output import StructuredOutputComponent
from px.field_typing.range_spec import RangeSpec
from px.helpers.base_model import build_model_from_schema
from px.inputs.inputs import BoolInput
from px.io import (
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
from px.schema.dataframe import DataFrame
from px.schema.table import EditMode

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

_SCENE_BATCH_SIZE_DEFAULT: int = 10

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


class GenerateStoryboardComponent(StructuredOutputComponent):
    display_name = "Generate Storyboard"
    name = "GenerateStoryboard"
    description = (
        "Generates a structured storyboard via multi-pass LLM calls. "
        "Pass 1 builds initial context (characters, locations, props, metadata). "
        "Pass 2+ generates scenes in batches, optionally guided by audio-analysis segments. "
        "Single-pass outputs (Build Structured Output / Dataframe) are retained for backward compatibility."
    )
    icon = "sparkles"
    documentation: str = "https://docs.portals.org/components-models"
    category = "models"

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
        Output(
            display_name="Structured Output (DataFrame)",
            name="dataframe_output",
            method="build_structured_dataframe",
        ),
    ]

    # Preserved as None; actual value computed at runtime by build_system_prompt().
    # (Original class-level `system_prompt = build_system_prompt()` called the method
    # as an unbound function before `self` exists — a TypeError at import time.)
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
        # ── Multi-pass / Audio ────────────────────────────────────────────────
        MultilineInput(
            name="audio_segments_json",
            display_name="Audio Segments (JSON)",
            info=(
                "Optional. JSON array of audio-analysis segments "
                "(e.g. [{startTime, endTime, duration, transcript, …}]). "
                "When provided, scene generation is anchored to audio timing — "
                "enabling the audio-guided multi-pass mode."
            ),
            required=False,
            advanced=False,
        ),
        MessageTextInput(
            name="project_id",
            display_name="Project ID",
            info=(
                "Optional. When set, the assembled storyboard is also persisted "
                "to the project database via project_repository (if available on the component)."
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
            info=(
                "Schema for single-pass structured output "
                "(used by Build Structured Output / Build Structured Dataframe)."
            ),
            required=True,
            # TODO: remove default value
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

    # =========================================================================
    # CONFIG UPDATE (unchanged)
    # =========================================================================

    def update_build_config(self, build_config: dict, field_value: str, field_name: str | None = None):
        """Dynamically update build config with user-filtered model options."""
        return handle_model_input_update(self, build_config, field_value, field_name)

    # =========================================================================
    # SHARED INTERNAL HELPERS
    # =========================================================================

    def _parse_audio_segments(self) -> list | None:
        """Parse the optional ``audio_segments_json`` input field.

        Returns a list of segment dicts, or None when the field is absent/invalid.
        """
        raw = getattr(self, "audio_segments_json", None)
        if not raw or not str(raw).strip():
            return None
        try:
            segments = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning(f"Failed to parse audio_segments_json ({exc}) — audio-guided mode disabled.")
            return None
        if not isinstance(segments, list):
            logger.warning("audio_segments_json is not a JSON array — audio-guided mode disabled.")
            return None
        logger.info(f"Parsed {len(segments)} audio segment(s).")
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
        # get_chat_result() expects get_langchain_callbacks as a callable.
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
        """
        if not schema_rows:
            msg = f"Schema rows for '{model_name}' cannot be empty."
            raise ValueError(msg)
        inner = build_model_from_schema(schema_rows)
        return create_model(
            model_name,
            __doc__=doc,
            **{  # type: ignore[arg-type]
                key: (
                    list[inner],
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
            if result:
                return result
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
        """Normalise an extraction result into a plain ``list[dict]``.

        Handles:
          * Trustcall envelope  {"responses": [<BaseModel|dict>, ...]}
          * Wrapper dict        {"<key>": [...]}
          * Bare BaseModel
          * Bare list

        The *key* defaults to ``"objects"`` (``_build_wrapped_schema`` default).
        Pass ``"scenes"`` when unwrapping a SceneBatch result.
        """
        if raw is None:
            return []
        # Trustcall envelope
        if isinstance(raw, dict) and "responses" in raw:
            responses = raw["responses"]
            if responses:
                first = responses[0]
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
        return []

    # =========================================================================
    # PROMPT BUILDERS (multi-pass)
    # =========================================================================

    def _build_initial_context_prompt(self, audio_segments: list | None) -> str:
        """System prompt for Pass 1: initial context (characters, locations, props, metadata)."""
        base = build_storyboard_vision_prompt(title=self.title or "", user_prompt=self.input_value)

        audio_section = ""
        if audio_segments:
            last = audio_segments[-1]
            total_dur = last.get("endTime", last.get("duration", "unknown"))
            audio_section = (
                "\n\n## Audio Analysis Context\n"
                f"{len(audio_segments)} audio segments detected "
                f"(total duration: {total_dur}s).\n"
                f"Segments:\n{json.dumps(audio_segments, indent=2)}\n\n"
                "Use these segments to ground your characters, locations, and props "
                "in the audio narrative."
            )

        return (
            f"{base}{audio_section}\n\n"
            "## Task — Pass 1: Initial Context\n"
            "Generate ONLY the foundational storyboard elements listed below.\n"
            "Do NOT generate individual scenes; scene enrichment follows in the next pass.\n\n"
            "Required elements:\n"
            "  • **characters** — named individuals with referenceId, name, description, and traits\n"
            "  • **locations**  — distinct settings with referenceId, name, and description\n"
            "  • **props**      — key physical objects central to the narrative\n"
            "  • **metadata**   — title, genre, mood, tone, logline, and duration estimates"
        )

    def _build_scene_batch_prompt(
        self,
        initial_context: dict,
        batch_num: int,
        total_batches: int,
    ) -> str:
        """System prompt for Pass 2+: batched scene enrichment."""
        base = build_storyboard_vision_prompt(title=self.title or "", user_prompt=self.input_value)
        chars_json = json.dumps(initial_context.get("characters", []), indent=2)
        locs_json = json.dumps(initial_context.get("locations", []), indent=2)

        return (
            f"{base}\n\n"
            "## Established Context (read-only — do not modify)\n"
            f"### Characters\n```json\n{chars_json}\n```\n\n"
            f"### Locations\n```json\n{locs_json}\n```\n\n"
            f"## Task — Pass 2, Batch {batch_num}/{total_batches}: Scene Enrichment\n"
            "Generate ONLY the scenes provided in the user message.\n"
            "Reference characters and locations by their established referenceIds.\n"
            "Do not invent new characters or locations.\n"
            "Preserve all timing fields (startTime, endTime, duration) from the input exactly."
        )

    # =========================================================================
    # MULTI-PASS GENERATION — PASS 1
    # =========================================================================

    def _generate_initial_context(
        self,
        llm: Any,
        config_dict: dict,
        audio_segments: list | None,
    ) -> dict:
        """Call the LLM to produce storyboard metadata, characters, locations, and props.

        Audio segments are included in the prompt when present to ground the context
        in the audio narrative.

        Returns a single context dict (first element of the wrapped objects list).
        """
        schema_rows = getattr(self, "initial_context_schema", None) or _DEFAULT_INITIAL_CONTEXT_SCHEMA
        schema = self._build_wrapped_schema(schema_rows, "InitialContextModel", "Initial storyboard context.")
        system_prompt = self._build_initial_context_prompt(audio_segments)

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
    ) -> list[dict]:
        """Enrich one batch of scene slots using the established initial context.

        Continuity is maintained via the previous-scene and exposition (first-scene)
        signals appended to the user message.
        """
        scene_schema_rows = getattr(self, "scene_schema", None) or _DEFAULT_SCENE_SCHEMA
        scene_batch_schema = self._build_wrapped_schema(
            schema_rows=scene_schema_rows,
            model_name="SceneBatch",
            doc="A batch of enriched storyboard scenes.",
            key="scenes",
        )

        system_prompt = self._build_scene_batch_prompt(initial_context, batch_num, total_batches)

        # Build user message with continuity signals (mirrors TypeScript agent logic)
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
    # PROJECT DATABASE PERSISTENCE
    # =========================================================================

    def _save_to_project_db(self, storyboard_data: dict) -> None:
        """Persist the assembled storyboard to the project database.

        Non-fatal: logs errors without re-raising so the component output is
        still returned even if persistence fails.

        Looks for ``project_repository`` (primary) or ``get_project_context``
        (secondary) on the component instance — whichever the platform injects.
        """
        project_id = getattr(self, "project_id", None)
        if not project_id:
            logger.debug("No project_id set — skipping database persistence.")
            return

        try:
            if hasattr(self, "project_repository"):
                self.project_repository.update_storyboard(project_id, storyboard_data)
                logger.info(f"Storyboard persisted to project '{project_id}' via project_repository.")
                return

            if hasattr(self, "get_project_context"):
                ctx = self.get_project_context(project_id)
                if hasattr(ctx, "update_storyboard"):
                    ctx.update_storyboard(storyboard_data)
                    logger.info(f"Storyboard persisted to project '{project_id}' via project context.")
                    return

            logger.warning(
                f"project_id='{project_id}' provided but no persistence interface "
                "(project_repository / get_project_context) found on this component. "
                "Storyboard was NOT saved to the database."
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(f"Non-fatal: failed to persist storyboard to project '{project_id}': {exc}")

    # =========================================================================
    # OUTPUT — MULTI-PASS STORYBOARD  (new)
    # =========================================================================

    def build_storyboard(self) -> Data:
        """Multi-pass storyboard generation output.

        Pass 1  — Generate initial context: characters, locations, props, metadata.
        Pass 2+ — Generate scenes in batches:
                    • Audio-guided: audio segments are the scene anchors;
                      timing fields are preserved verbatim.
                    • Prompt-only: a single open-ended slot lets the LLM
                      decide the scene count from the narrative.

        The final storyboard is:
          1. Returned as ``Data`` (component output).
          2. Optionally persisted to the project database when ``project_id`` is set.
        """
        llm, config_dict, token_handler = self._setup_llm_and_config()
        audio_segments = self._parse_audio_segments()
        batch_size: int = getattr(self, "scene_batch_size", _SCENE_BATCH_SIZE_DEFAULT)

        logger.info(
            "Starting multi-pass storyboard generation | "
            f"title='{self.title or ''}', "
            f"audio_segments={len(audio_segments) if audio_segments else 0}, "
            f"batch_size={batch_size}"
        )

        # ── Pass 1: Initial Context ───────────────────────────────────────────
        logger.info("Pass 1: generating initial context (characters, locations, props, metadata)…")
        initial_context = self._generate_initial_context(llm, config_dict, audio_segments)
        logger.info(
            "Pass 1 complete | "
            f"characters={len(initial_context.get('characters', []))}, "
            f"locations={len(initial_context.get('locations', []))}, "
            f"props={len(initial_context.get('props', []))}"
        )

        # ── Pass 2+: Scene Generation ─────────────────────────────────────────
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
            )
            all_scenes.extend(batch_scenes)
            logger.info(f"  Batch {batch_num}/{total_batches} complete — running total: {len(all_scenes)} scene(s)")

        # Re-index scenes sequentially
        for i, scene in enumerate(all_scenes):
            if isinstance(scene, dict):
                scene["sceneIndex"] = i

        # ── Assemble final storyboard ─────────────────────────────────────────
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

        # Persist to project DB (non-fatal)
        self._save_to_project_db(storyboard)

        return Data(data=storyboard)

    # =========================================================================
    # OUTPUT — SINGLE-PASS (backward compatible, unchanged behaviour)
    # =========================================================================

    def build_system_prompt(self) -> str:
        """Compute and return the system prompt for single-pass generation.

        Also exposed as a component output so downstream nodes can inspect it.

        Bug fixes vs original:
          * Added missing ``return``.
          * Replaced undefined ``project.metadata.title`` with ``self.title or ""``.
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

        output_model_ = build_model_from_schema(self.output_schema)
        output_model = create_model(
            schema_name,
            __doc__=f"A list of {schema_name}.",
            objects=(
                list[output_model_],
                Field(
                    description=f"A list of {schema_name}.",  # type: ignore[valid-type]
                    min_length=1,  # help ensure non-empty output
                ),
            ),
        )
        # Tracing config with token usage handler injected into the callbacks chain.
        # get_chat_result() reads "get_langchain_callbacks" as a callable, so we wrap
        # the list in a lambda to match its expected interface.
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
            result = self._extract_output_with_langchain(llm, output_model, config_dict)
        self._token_usage = token_handler.get_usage()

        # OPTIMIZATION NOTE: Simplified processing based on trustcall response structure
        # Handle non-dict responses (shouldn't happen with trustcall, but defensive)
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
        # Extract the objects array (guaranteed to exist due to our Pydantic model structure)
        return structured_data.get("objects", structured_data)

    def build_structured_output(self) -> Data:
        output = self.build_structured_output_base()
        if not isinstance(output, list) or not output:
            # handle empty or unexpected type case
            msg = "No structured output returned"
            raise ValueError(msg)
        if len(output) == 1:
            return Data(data=output[0])
        if len(output) > 1:
            # Multiple outputs - wrap them in a results container
            return Data(data={"results": output})
        return Data()

    def build_structured_dataframe(self) -> DataFrame:
        output = self.build_structured_output_base()
        if not isinstance(output, list) or not output:
            # handle empty or unexpected type case
            msg = "No structured output returned"
            raise ValueError(msg)
        if len(output) == 1:
            # For single dictionary, wrap in a list to create DataFrame with one row
            return DataFrame([output[0]])
        if len(output) > 1:
            # Multiple outputs - convert to DataFrame directly
            return DataFrame(output)
        return DataFrame()

    def _extract_output_with_trustcall(self, llm, schema: BaseModel, config_dict: dict) -> list[BaseModel] | None:
        # system_prompt computed at runtime to avoid the broken class-level attribute.
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
                "(Note: This may not be an error—some models or configurations do not support tool calling. "
                "Falling back is normal in such cases.)"
            )
            return None
        return result or None  # langchain fallback is used if error occurs or the result is empty

    def _extract_output_with_langchain(self, llm, schema: BaseModel, config_dict: dict) -> list[BaseModel] | None:
        # system_prompt computed at runtime to avoid the broken class-level attribute.
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
