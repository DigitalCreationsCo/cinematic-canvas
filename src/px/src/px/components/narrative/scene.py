from __future__ import annotations

import json

from portals.schema import Data
from portals.services.database.models.scene.model import Scene

from px.base.models.model import LCModelComponent
from px.base.models.unified_models import get_llm
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.field_typing.constants import (
    LanguageModel,  # noqa: TC001 — needed at runtime; eval prepend neutralizes `from __future__ import annotations`
)
from px.field_typing.range_spec import RangeSpec
from px.io import (
    BoolInput,
    DropdownInput,
    MessageInput,
    MessageTextInput,
    ModelInput,
    Output,
    SecretStrInput,
    SliderInput,
)
from px.log.logger import logger
from px.schema.message import (
    Message,  # noqa: TC001 — needed at runtime; eval prepend neutralizes `from __future__ import annotations`
)
from px.utils.constants import (
    MESSAGE_SENDER_AI,
    MESSAGE_SENDER_NAME_USER,
    MESSAGE_SENDER_USER,
)


class SceneComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display scene details and generate scene-aware LLM responses.

    This component reads scene records from the ``scenes`` table scoped to
    the current project. It exposes two outputs:

    * **scene_data** — raw scene record for downstream narrative processing.
    * **scene_response** — an LLM-generated narrative or analysis grounded in
      the selected scene's context.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are scene-specific (scene_data, scene_response) rather than
    # the generic model-output names (text_output, model_output).
    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Scene"
    description = "Display scene details and generate scene-aware LLM responses."
    icon = "clapperboard"
    name = "Scene"
    minimized = True

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Scene
    storyboard_key = "scenes"

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → scene_dict so that graph executions referencing
    # both outputs for the same scene only hit the database once.
    _scene_cache: dict[str, dict]

    def build_config(self):
        return {
            "selected_entity": {
                "display_name": "Select Scene",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            "update_database": {
                "display_name": "Patch Database?",
                "info": "If true, the scene's record will be updated with the traits/state below.",
                "advanced": False,
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    inputs = [
        DropdownInput(name="selected_entity", display_name="Select Scene"),
        BoolInput(name="update_database", display_name="Patch Database?", value=False),
        ModelInput(
            name="model",
            display_name="Language Model",
            info="Select your model provider",
            real_time_refresh=True,
            required=True,
        ),
        MessageInput(
            name="input_value",
            display_name="Input",
            info="The input text to send to the model",
        ),
        BoolInput(
            name="should_store_message",
            display_name="Store Messages",
            info="Store the message in the history.",
            value=True,
            advanced=True,
        ),
        DropdownInput(
            name="sender",
            display_name="Sender Type",
            options=[MESSAGE_SENDER_AI, MESSAGE_SENDER_USER],
            value=MESSAGE_SENDER_USER,
            info="Type of sender.",
            advanced=True,
        ),
        MessageTextInput(
            name="sender_name",
            display_name="Sender Name",
            info="Name of the sender.",
            value=MESSAGE_SENDER_NAME_USER,
            advanced=True,
        ),
        MessageTextInput(
            name="session_id",
            display_name="Session ID",
            info="The session ID of the chat. If empty, the current session ID parameter will be used.",
            advanced=True,
        ),
        MessageTextInput(
            name="context_id",
            display_name="Context ID",
            info="The context ID of the chat. Adds an extra layer to the local memory.",
            value="",
            advanced=True,
        ),
        SliderInput(
            name="temperature",
            display_name="Temperature",
            value=0.5,
            info="Controls randomness in responses",
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            advanced=True,
        ),
        BoolInput(
            name="stream",
            display_name="Stream",
            info="Whether to stream the response",
            value=False,
            advanced=True,
        ),
        MessageTextInput(
            name="tool_placeholder",
            display_name="Tool Placeholder",
            tool_mode=True,
            advanced=True,
            show=False,
            info="A placeholder input for tool mode.",
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            info="Overrides global provider settings. Leave blank to use your pre-configured API Key.",
            required=False,
            show=True,
            real_time_refresh=True,
            advanced=True,
        ),
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Scene Data", name="scene_data", method="build"),
        Output(display_name="Scene Response", name="scene_response", method="scene_response"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected scene from the database and return it as structured Data.

        Results are cached per entity name so that a subsequent call to
        ``scene_response()`` within the same execution avoids a redundant
        database round-trip.

        When ``update_database`` is ``True`` the cache entry for the entity is
        evicted before reading, ensuring the next read fetches fresh data.
        """
        # Evict cache when the caller signals a database mutation.
        if update_database:
            self._scene_cache.pop(selected_entity, None)
            logger.debug(f"Cache evicted for scene '{selected_entity}' after patch.")

        try:
            scene_dict = self._fetch_scene_data(selected_entity)
            return Data(data=scene_dict)
        except ValueError as exc:
            logger.error(f"Failed to fetch scene '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

    async def scene_response(self) -> Message:
        """Generate a scene-aware LLM response grounded in the selected scene.

        Execution flow
        --------------
        1. Validates that a scene is selected.
        2. Fetches scene data from the database (served from cache when
           ``build()`` already ran for the same entity).
        3. Constructs a system prompt from the scene's profile — name,
           mood, cinematography, timing, and character references.
        4. Invokes the connected language model with the user's input message.
        5. Returns the model's response as a ``Message``.

        Raises:
        ------
        ValueError
            If no scene is selected, the scene is not found in the
            database, or no language model is connected.
        """
        entity_name = getattr(self, "selected_entity", None)
        _validate_selected_scene(entity_name)

        # 1. Fetch scene data (from cache or DB).
        try:
            scene_dict = self._fetch_scene_data(entity_name)
        except ValueError as exc:
            logger.error(f"Scene '{entity_name}' not found for response generation: {exc}")
            raise

        logger.debug(
            "Generating scene response for '%s' with %d field(s).",
            entity_name,
            len(scene_dict),
        )

        # 2. Build scene-aware system prompt.
        system_prompt = self._build_scene_system_prompt(scene_dict)

        # 3. Validate model input.
        model = getattr(self, "model", None)
        if not model:
            msg = "A Language Model must be connected to generate scene responses."
            raise ValueError(msg)

        # 4. Build and invoke the LLM.
        runnable = self.build_model()
        input_value = getattr(self, "input_value", None) or ""
        stream: bool = getattr(self, "stream", False)

        result = await self.get_chat_result(
            runnable=runnable,
            stream=stream,
            input_value=input_value,
            system_message=system_prompt,
        )
        self.status = result
        return result

    # ═══════════════════════════════════════════════════════════════════════
    # LLM INTEGRATION
    # ═══════════════════════════════════════════════════════════════════════

    def build_model(self) -> LanguageModel:
        """Build the language model from the configured model input.

        Delegates to ``get_llm()`` which resolves the provider, API key, and
        model-specific parameters.
        """
        return get_llm(
            model=self.model,
            user_id=self.user_id,
            api_key=getattr(self, "api_key", None),
            temperature=getattr(self, "temperature", 0.5),
            stream=getattr(self, "stream", False),
        )

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _fetch_scene_data(self, entity_name: str) -> dict:
        """Fetch scene data from the database with instance-level caching.

        Results are cached per entity name within a single component execution
        so that both ``build()`` and ``scene_response()`` can share the
        same database record without a redundant read.
        """
        # Lazy-init the cache so subclasses or direct __new__ usage doesn't break.
        if not hasattr(self, "_scene_cache") or self._scene_cache is None:
            self._scene_cache = {}

        # Return cached data when available.
        cached = self._scene_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for scene '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for scene '%s' — reading from database.", entity_name)

        # Read from DB via the shared base-entity logic.
        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        # Surface DB-level errors (e.g. scene not found).
        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        # Cache and return the raw dictionary.
        scene_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._scene_cache[entity_name] = scene_dict
        return scene_dict

    @staticmethod
    def _build_scene_system_prompt(scene_dict: dict) -> str:
        """Construct a scene-aware system prompt from scene data.

        Parameters
        ----------
        scene_dict : dict
            A dictionary with keys from the ``Scene`` model, typically
            ``name``, ``mood``, ``shot_type``, ``camera_angle``,
            ``camera_movement``, ``lighting``, ``composition``,
            ``character_reference_ids``, ``location_reference_id``,
            and optionally ``guidance_level``.

        Returns:
        -------
        str
            A system-prompt string that instructs the LLM to respond as a
            scene-aware narrator grounded in the scene's context.
        """
        name: str = scene_dict.get("name", "Unknown Scene") or "Unknown Scene"
        mood: str = scene_dict.get("mood", "") or ""
        shot_type: str = scene_dict.get("shot_type", "") or ""
        camera_angle: str = scene_dict.get("camera_angle", "") or ""
        camera_movement: str = scene_dict.get("camera_movement", "") or ""
        lighting: dict | None = scene_dict.get("lighting")
        composition: dict | None = scene_dict.get("composition")
        character_reference_ids: list[str] = scene_dict.get("character_reference_ids") or []
        location_reference_id: str = scene_dict.get("location_reference_id", "") or ""
        guidance_level: int | None = scene_dict.get("guidance_level")

        parts: list[str] = [
            f'You are a scene-aware narrator analyzing "{name}". '
            "Ground your response in the scene's established context — mood, "
            "cinematography, characters, and location. "
            "Never break character. Do not refer to yourself as an AI or language model."
        ]

        if mood:
            parts.append(f"\nScene mood: {mood}.")

        if shot_type or camera_angle or camera_movement:
            cinematography_parts = []
            if shot_type:
                cinematography_parts.append(f"shot: {shot_type}")
            if camera_angle:
                cinematography_parts.append(f"angle: {camera_angle}")
            if camera_movement:
                cinematography_parts.append(f"movement: {camera_movement}")
            parts.append(f"\nCinematography — {', '.join(cinematography_parts)}.")

        if lighting:
            lighting_str = json.dumps(lighting, indent=2)
            parts.append(f"\nLighting:\n```json\n{lighting_str}\n```")

        if composition:
            composition_str = json.dumps(composition, indent=2)
            parts.append(f"\nComposition:\n```json\n{composition_str}\n```")

        if character_reference_ids:
            parts.append(f"\nCharacters present: {', '.join(character_reference_ids)}.")

        if location_reference_id:
            parts.append(f"\nLocation: {location_reference_id}.")

        if guidance_level is not None:
            parts.append(f"\n(Guidance level: {guidance_level})")

        return "\n".join(parts)


# ── Module-level helpers ─────────────────────────────────────────────


def _validate_selected_scene(entity_name: str | None) -> None:
    """Validate that ``entity_name`` is a meaningful scene selection.

    Raises:
    ------
    ValueError
        If the entity name is ``None``, empty, or one of the placeholder
        messages returned by ``get_entity_options()`` when no entities exist.
    """
    if not entity_name or not entity_name.strip():
        msg = (
            "No scene selected. Please select a valid scene from the dropdown "
            "or connect a valid scene name to the 'selected_entity' input port."
        )
        raise ValueError(msg)

    placeholder_messages = frozenset(
        {
            "No entities found",
            "No active flow context",
            "No project found",
        }
    )
    if entity_name in placeholder_messages:
        msg = f"No scene available ('{entity_name}'). Ensure the project has scenes before using this component."
        raise ValueError(msg)
