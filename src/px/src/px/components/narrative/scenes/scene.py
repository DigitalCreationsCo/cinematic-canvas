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
    """Display scene details and generate narrative LLM responses.

    This component reads scene records from the ``scenes`` table scoped to
    the current project. It exposes two outputs:

    * **scene_data** — raw scene record for downstream narrative processing.
    * **scene_response** — an LLM-generated reply detailing the selected
      scene's narrative progression and action.
    """

    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Scene"
    description = "Display scene details and generate narrative LLM responses."
    icon = "film"
    name = "Scene"
    minimized = True

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Scene
    storyboard_key = "scenes"

    # ── Instance-level cache ─────────────────────────────────────────────
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
                "info": "If true, the scene's record will be updated.",
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
        entity_name = getattr(self, "selected_entity", None)
        _validate_selected_entity(entity_name)

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

        system_prompt = self._build_scene_system_prompt(scene_dict)

        model = getattr(self, "model", None)
        if not model:
            msg = "A Language Model must be connected to generate scene responses."
            raise ValueError(msg)

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
        if not hasattr(self, "_scene_cache") or self._scene_cache is None:
            self._scene_cache = {}

        cached = self._scene_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for scene '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for scene '%s' — reading from database.", entity_name)

        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        scene_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._scene_cache[entity_name] = scene_dict
        return scene_dict

    @staticmethod
    def _build_scene_system_prompt(scene_dict: dict) -> str:
        name: str = scene_dict.get("name", "Unknown Scene") or "Unknown Scene"
        description: str = scene_dict.get("description", "")
        mood: str = scene_dict.get("mood", "")
        audio_sync: str = scene_dict.get("audioSync", "")
        continuity_notes: list[str] = scene_dict.get("continuityNotes") or []
        character_references: list[str] = scene_dict.get("characterReferenceIds") or []
        location_reference: str = scene_dict.get("locationReferenceId", "")

        cinematography: dict | None = scene_dict.get("cinematography")
        lighting: dict | None = scene_dict.get("lighting")

        parts: list[str] = [
            f"You are the director and narrative describer for the scene '{name}'. "
            "Respond by expanding on the narrative action, emotional beats, and continuity of the scene. "
            "Maintain consistency with the provided properties."
        ]

        if description:
            parts.append(f"\nDescription:\n{description}")

        if mood:
            parts.append(f"\nMood: {mood}")

        if location_reference:
            parts.append(f"Location: {location_reference}")

        if character_references:
            parts.append(f"Characters Present: {', '.join(character_references)}")

        if audio_sync:
            parts.append(f"Audio Sync: {audio_sync}")

        if continuity_notes:
            parts.append("\nContinuity Notes:\n- " + "\n- ".join(continuity_notes))

        if cinematography:
            parts.append(f"\nCinematography:\n```json\n{json.dumps(cinematography, indent=2)}\n```")

        if lighting:
            parts.append(f"\nLighting:\n```json\n{json.dumps(lighting, indent=2)}\n```")

        return "\n".join(parts)


def _validate_selected_entity(entity_name: str | None) -> None:
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
