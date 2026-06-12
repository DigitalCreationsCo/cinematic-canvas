from __future__ import annotations

import json

from portals.schema import Data
from portals.services.database.models.prop.model import Prop

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


class PropComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display prop details and generate descriptive LLM responses.

    This component reads prop records from the ``props`` table scoped to
    the current project. It exposes two outputs:

    * **prop_data** — raw prop record for downstream narrative processing.
    * **prop_response** — an LLM-generated reply detailing the selected
      prop's appearance and narrative usage.
    """

    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Prop"
    description = "Display prop details and generate descriptive LLM responses."
    icon = "box"
    name = "Prop"
    minimized = True

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Prop
    storyboard_key = "props"

    # ── Instance-level cache ─────────────────────────────────────────────
    _prop_cache: dict[str, dict]

    def build_config(self):
        return {
            "selected_entity": {
                "display_name": "Select Prop",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            "update_database": {
                "display_name": "Patch Database?",
                "info": "If true, the prop's record will be updated.",
                "advanced": False,
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    inputs = [
        DropdownInput(name="selected_entity", display_name="Select Prop"),
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
        Output(display_name="Prop Data", name="prop_data", method="build"),
        Output(display_name="Prop Response", name="prop_response", method="prop_response"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        if update_database:
            self._prop_cache.pop(selected_entity, None)
            logger.debug(f"Cache evicted for prop '{selected_entity}' after patch.")

        try:
            prop_dict = self._fetch_prop_data(selected_entity)
            return Data(data=prop_dict)
        except ValueError as exc:
            logger.error(f"Failed to fetch prop '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

    async def prop_response(self) -> Message:
        entity_name = getattr(self, "selected_entity", None)
        _validate_selected_entity(entity_name)

        try:
            prop_dict = self._fetch_prop_data(entity_name)
        except ValueError as exc:
            logger.error(f"Prop '{entity_name}' not found for response generation: {exc}")
            raise

        logger.debug(
            "Generating prop response for '%s' with %d field(s).",
            entity_name,
            len(prop_dict),
        )

        system_prompt = self._build_prop_system_prompt(prop_dict)

        model = getattr(self, "model", None)
        if not model:
            msg = "A Language Model must be connected to generate prop responses."
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

    def _fetch_prop_data(self, entity_name: str) -> dict:
        if not hasattr(self, "_prop_cache") or self._prop_cache is None:
            self._prop_cache = {}

        cached = self._prop_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for prop '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for prop '%s' — reading from database.", entity_name)

        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        prop_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._prop_cache[entity_name] = prop_dict
        return prop_dict

    @staticmethod
    def _build_prop_system_prompt(prop_dict: dict) -> str:
        name: str = prop_dict.get("name", "Unknown Prop") or "Unknown Prop"
        description: str = prop_dict.get("description", "")
        prop_type: str = prop_dict.get("type", "")
        material: str = prop_dict.get("material", "")
        condition: str = prop_dict.get("condition", "")
        state: dict | None = prop_dict.get("state")
        guidance_level: int | None = prop_dict.get("guidance_level")

        parts: list[str] = [
            f"You are the prop master and describer for the prop '{name}'. "
            "Respond by expanding on the prop's physical appearance, texture, and significance in the narrative. "
            "Maintain consistency with the provided properties."
        ]

        if description:
            parts.append(f"\nDescription:\n{description}")

        details = []
        if prop_type:
            details.append(f"Type: {prop_type}")
        if material:
            details.append(f"Material: {material}")
        if condition:
            details.append(f"Condition: {condition}")

        if details:
            parts.append("\nPhysical Details:\n- " + "\n- ".join(details))

        if state:
            state_str = json.dumps(state, indent=2)
            parts.append(f"\nCurrent State:\n```json\n{state_str}\n```")

        if guidance_level is not None:
            parts.append(f"\n(Guidance level: {guidance_level})")

        return "\n".join(parts)


def _validate_selected_entity(entity_name: str | None) -> None:
    if not entity_name or not entity_name.strip():
        msg = (
            "No prop selected. Please select a valid prop from the dropdown "
            "or connect a valid prop name to the 'selected_entity' input port."
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
        msg = f"No prop available ('{entity_name}'). Ensure the project has props before using this component."
        raise ValueError(msg)
