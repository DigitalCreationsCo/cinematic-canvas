from __future__ import annotations

import json

from portals.schema import Data
from portals.services.database.models.character.model import Character

from px.base.models.model import LCModelComponent
from px.base.models.unified_models import get_llm
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.field_typing.constants import (
    LanguageModel,  # noqa: TC001 — needed at runtime; eval prepend neutralizes `from __future__ import annotations`
)
from px.field_typing.range_spec import RangeSpec
from px.io import (
    BoolInput,
    DictInput,
    DropdownInput,
    MessageInput,
    MessageTextInput,
    ModelInput,
    Output,
    SecretStrInput,
    SliderInput,
    StrInput,
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

# ── Field name constants ─────────────────────────────────────────────

_SELECTED_ENTITY = "selected_entity"
_UPDATE_DB = "update_database"
_CHARACTER_NAME = "character_name"
_ALIASES = "aliases"
_PHYSICAL_TRAITS = "physical_traits"
_STATE = "state"
_GUIDANCE_LEVEL = "guidance_level"

# Profile fields that can be edited and patched.
_PROFILE_FIELDS = (
    _CHARACTER_NAME,
    _ALIASES,
    _PHYSICAL_TRAITS,
    _STATE,
    _GUIDANCE_LEVEL,
)

# Map from input name → entity model field name.
_INPUT_TO_MODEL_FIELD = {
    _CHARACTER_NAME: "name",
    _ALIASES: "aliases",
    _PHYSICAL_TRAITS: "physical_traits",
    _STATE: "state",
    _GUIDANCE_LEVEL: "guidance_level",
}


class CharacterComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display character details and generate persona-driven LLM responses.

    This component reads character records from the ``characters`` table scoped to
    the current project. It exposes two outputs:

    * **character_data** — raw character record for downstream narrative processing.
    * **character_response** — an LLM-generated reply delivered in the selected
      character's persona.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are character-specific (character_data, character_response) rather
    # than the generic model-output names (text_output, model_output).
    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Character"
    description = "Display character details and generate persona-driven LLM responses."
    icon = "user"
    name = "Character"

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Character
    storyboard_key = "characters"

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → character_dict so that graph executions referencing
    # both outputs for the same character only hit the database once.
    _character_cache: dict[str, dict]

    def build_config(self):
        return {
            _SELECTED_ENTITY: {
                "display_name": "Select Character",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch Database?",
                "info": "If true, the character's record will be updated with the traits/state below.",
                "advanced": False,
            },
            _CHARACTER_NAME: {
                "display_name": "Name",
                "info": "Character's display name.",
            },
            _ALIASES: {
                "display_name": "Aliases",
                "info": "Alternative names this character goes by.",
            },
            _PHYSICAL_TRAITS: {
                "display_name": "Physical Traits",
                "info": 'Physical description as a JSON object (e.g. {"hair": "brown", "eyes": "blue"}).',
            },
            _STATE: {
                "display_name": "State",
                "info": "Current narrative state as a JSON object.",
            },
            _GUIDANCE_LEVEL: {
                "display_name": "Guidance Level",
                "info": "Controls how closely the model should follow the character profile.",
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    # Profile editing fields.
    _profile_inputs = [
        StrInput(
            name=_CHARACTER_NAME,
            display_name="Name",
            info="Character's display name.",
            value="",
        ),
        MessageTextInput(
            name=_ALIASES,
            display_name="Aliases",
            info="Alternative names this character goes by (comma-separated).",
            value="",
        ),
        DictInput(
            name=_PHYSICAL_TRAITS,
            display_name="Physical Traits",
            info='Physical description as a JSON object (e.g. {"hair": "brown", "eyes": "blue"}).',
        ),
        DictInput(
            name=_STATE,
            display_name="State",
            info="Current narrative state as a JSON object.",
        ),
        SliderInput(
            name=_GUIDANCE_LEVEL,
            display_name="Guidance Level",
            info="Controls how closely the model should follow the character profile.",
            value=5,
            range_spec=RangeSpec(min=0, max=10, step=1),
            advanced=True,
        ),
    ]

    inputs = [
        DropdownInput(name=_SELECTED_ENTITY, display_name="Select Character"),
        BoolInput(name=_UPDATE_DB, display_name="Patch Database?", value=False),
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
        *_profile_inputs,
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Character Data", name="character_data", method="build"),
        Output(display_name="Character Response", name="character_response", method="character_response"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected character from the database and return it as structured Data.

        Results are cached per entity name so that a subsequent call to
        ``character_response()`` within the same execution avoids a redundant
        database round-trip.

        When ``update_database`` is ``True``:
        - The entity's profile fields (name, aliases, physical_traits, state,
          guidance_level, character_image) are patched to the database.
        - The cache entry is evicted before reading, ensuring the next read
          fetches fresh data.

        Any profile-field values provided via inputs are merged on top of the
        database record so that downstream consumers always receive the most
        current view.
        """
        # 1. Collect any profile-field overrides supplied via inputs.
        updated_data = self._collect_profile_overrides()

        # 2. When the caller signals a database mutation, perform the patch
        #    and evict the cached entry so the subsequent read is fresh.
        if update_database:
            # Map input names → model field names (with type conversion).
            model_updates = self._to_model_patch(updated_data)

            # Execute the patch via the shared base-entity logic.
            if model_updates:
                self._character_cache.pop(selected_entity, None)
                logger.debug(f"Patching character '{selected_entity}' with {model_updates}")
                patch_result = self._execute_read_patch_logic(
                    selected_entity,
                    update_database=True,
                    updated_data=model_updates,
                )
                if (
                    isinstance(patch_result, Data)
                    and isinstance(patch_result.data, dict)
                    and "error" in patch_result.data
                ):
                    logger.error(f"Patch failed for character '{selected_entity}': {patch_result.data['error']}")
                    return patch_result

        # 3. Read from DB (fresh or cached).
        try:
            character_dict = self._fetch_character_data(selected_entity)
        except ValueError as exc:
            logger.error(f"Failed to fetch character '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

        # 4. Overlay any input-driven overrides so the output reflects the
        #    user's edits even when the DB has not been patched yet.
        character_dict.update(self._to_model_patch(updated_data))

        return Data(data=character_dict)

    async def character_response(self) -> Message:
        """Generate a persona-driven LLM response as the selected character.

        Execution flow
        --------------
        1. Validates that a character is selected.
        2. Fetches character data from the database (served from cache when
           ``build()`` already ran for the same entity).
        3. Overlays any profile-field input values on top of the DB record.
        4. Constructs a system prompt from the merged character profile.
        5. Invokes the connected language model with the user's input message.
        6. Returns the model's response as a ``Message``.

        Raises:
        ------
        ValueError
            If no character is selected, the character is not found in the
            database, or no language model is connected.
        """
        entity_name = getattr(self, _SELECTED_ENTITY, None)
        _validate_selected_entity(entity_name)

        # 1. Fetch character data (from cache or DB).
        try:
            character_dict = self._fetch_character_data(entity_name)
        except ValueError as exc:
            logger.error(f"Character '{entity_name}' not found for response generation: {exc}")
            raise

        # 2. Overlay input-driven profile edits on top of the DB record.
        updated_data = self._collect_profile_overrides()
        character_dict.update(self._to_model_patch(updated_data))

        logger.debug(
            "Generating character response for '%s' with %d field(s).",
            entity_name,
            len(character_dict),
        )

        # 3. Build persona system prompt.
        system_prompt = self._build_character_system_prompt(character_dict)

        # 4. Validate model input.
        model = getattr(self, "model", None)
        if not model:
            msg = "A Language Model must be connected to generate character responses."
            raise ValueError(msg)

        # 5. Build and invoke the LLM.
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

    def _collect_profile_overrides(self) -> dict[str, object]:
        """Gather non-empty profile-field values from the component's input ports.

        Returns a dict keyed by **input name** (not model field).
        """
        overrides: dict[str, object] = {}
        for field_name in _PROFILE_FIELDS:
            value = getattr(self, field_name, None)
            if value is not None and value != "":
                overrides[field_name] = value
        return overrides

    @staticmethod
    def _to_model_patch(input_overrides: dict[str, object]) -> dict[str, object]:
        """Translate input-name keys to model-field keys.

        Only known mappings are included; unknown keys are silently dropped.
        Fields that arrive as a comma-separated string (e.g. ``aliases``)
        are automatically converted to ``list[str]``.
        """
        # Fields that come from ``MessageTextInput`` but must be stored as
        # ``list[str]`` in the model.
        _string_to_list = frozenset({"aliases"})

        patch: dict[str, object] = {}
        for input_name, value in input_overrides.items():
            model_field = _INPUT_TO_MODEL_FIELD.get(input_name)
            if not model_field:
                continue

            if model_field in _string_to_list and isinstance(value, str):
                patch[model_field] = [s.strip() for s in value.split(",") if s.strip()]
            else:
                patch[model_field] = value
        return patch

    def _fetch_character_data(self, entity_name: str) -> dict:
        """Fetch character data from the database with instance-level caching.

        Results are cached per entity name within a single component execution
        so that both ``build()`` and ``character_response()`` can share the
        same database record without a redundant read.
        """
        # Lazy-init the cache so subclasses or direct __new__ usage doesn't break.
        if not hasattr(self, "_character_cache") or self._character_cache is None:
            self._character_cache = {}

        # Return cached data when available.
        cached = self._character_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for character '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for character '%s' — reading from database.", entity_name)

        # Read from DB via the shared base-entity logic.
        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        # Surface DB-level errors (e.g. character not found).
        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        # Cache and return the raw dictionary.
        character_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._character_cache[entity_name] = character_dict
        return character_dict

    @staticmethod
    def _build_character_system_prompt(character_dict: dict) -> str:
        """Construct a persona-driven system prompt from character data.

        Parameters
        ----------
        character_dict : dict
            A dictionary with keys from the ``Character`` model, typically
            ``name``, ``aliases``, ``physical_traits``, ``state``, and
            optionally ``guidance_level``.

        Returns:
        -------
        str
            A system-prompt string that instructs the LLM to roleplay as the
            character.
        """
        name: str = character_dict.get("name", "Unknown Character") or "Unknown Character"
        aliases: list[str] = character_dict.get("aliases") or []
        physical_traits: dict | None = character_dict.get("physical_traits")
        state: dict | None = character_dict.get("state")
        guidance_level: int | None = character_dict.get("guidance_level")

        parts: list[str] = [
            f"You are roleplaying as {name}. Respond as this character would, "
            "staying true to their personality, knowledge, mannerisms, and circumstances. "
            "Never break character. Do not refer to yourself as an AI or language model."
        ]

        if aliases:
            parts.append(f"\nYou are also known as: {', '.join(aliases)}.")

        if physical_traits:
            traits_str = json.dumps(physical_traits, indent=2)
            parts.append(f"\nYour physical traits:\n```json\n{traits_str}\n```")

        if state:
            state_str = json.dumps(state, indent=2)
            parts.append(f"\nYour current narrative state:\n```json\n{state_str}\n```")

        if guidance_level is not None:
            parts.append(f"\n(Guidance level: {guidance_level})")

        return "\n".join(parts)


# ── Module-level helpers ─────────────────────────────────────────────


def _validate_selected_entity(entity_name: str | None) -> None:
    """Validate that ``entity_name`` is a meaningful character selection.

    Raises:
    ------
    ValueError
        If the entity name is ``None``, empty, or one of the placeholder
        messages returned by ``get_entity_options()`` when no entities exist.
    """
    if not entity_name or not entity_name.strip():
        msg = (
            "No character selected. Please select a valid character from the dropdown "
            "or connect a valid character name to the 'selected_entity' input port."
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
        msg = (
            f"No character available ('{entity_name}'). Ensure the project has characters before using this component."
        )
        raise ValueError(msg)
