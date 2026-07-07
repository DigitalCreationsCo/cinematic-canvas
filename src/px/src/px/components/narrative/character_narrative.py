from __future__ import annotations

import json

from portals.schema import Data

from px.base.models.model import LCModelComponent
from px.base.models.unified_models import get_llm
from px.components.narrative.base_state_aware import BaseStateAwareComponent
from px.field_typing.constants import (
    LanguageModel,  # noqa: TC001 — needed at runtime
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
    Message,  # noqa: TC001 — needed at runtime
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
_GENERATION_PROMPT = "generation_prompt"

# Profile fields that can be edited.
_PROFILE_FIELDS = (
    _CHARACTER_NAME,
    _ALIASES,
    _PHYSICAL_TRAITS,
    _STATE,
    _GUIDANCE_LEVEL,
)

# Map from input name → manifest field name.
_INPUT_TO_MANIFEST_FIELD = {
    _CHARACTER_NAME: "name",
    _ALIASES: "aliases",
    _PHYSICAL_TRAITS: "physical_traits",
    _STATE: "state",
    _GUIDANCE_LEVEL: "guidance_level",
}


class NarrativeCharacterComponent(BaseStateAwareComponent, LCModelComponent):
    """Display character details and generate persona-driven LLM responses.

    This component reads character manifests from the NAP universe scoped to
    the current project. It exposes two outputs:

    * **character_data** — raw character manifest for downstream narrative processing.
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

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → character manifest
    _character_cache: dict[str, dict]

    def build_config(self):
        return {
            _SELECTED_ENTITY: {
                "display_name": "Character Name",
                "info": (
                    "Type a character name. Existing characters appear as suggestions — "
                    "select to load. Type a new name to create."
                ),
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch NAP Manifest?",
                "info": (
                    "If true, the character's manifest will be updated. "
                    "In Gen3 architecture, writes go through the NAP persistence pipeline."
                ),
                "advanced": False,
            },
            _GENERATION_PROMPT: {
                "display_name": "Generation Prompt",
                "info": (
                    "Optional prompt for LLM-based character draft generation. "
                    "When set, typing a new character name will generate a draft character manifest."
                ),
                "advanced": True,
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
        DropdownInput(name=_SELECTED_ENTITY, display_name="Character Name", combobox=True, value=""),
        BoolInput(name=_UPDATE_DB, display_name="Patch NAP Manifest?", value=False),
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

    def build(self, selected_entity: str = "", *, update_database: bool = False) -> Data:
        """Read the selected character from the NAP universe and return it as structured Data.

        Results are cached per entity name so that a subsequent call to
        ``character_response()`` within the same execution avoids a redundant
        NAP resolution.

        When ``update_database`` is ``True``:
        - The manifest profile fields are logged for NAP persistence pipeline
        - The cache entry is evicted before reading

        Any profile-field values provided via inputs are merged on top of the
        manifest record so that downstream consumers always receive the most
        current view.
        """
        # 1. Ensure cache exists
        if not hasattr(self, "_character_cache") or self._character_cache is None:
            self._character_cache = {}

        # 2. Collect any profile-field overrides supplied via inputs.
        updated_data = self._collect_profile_overrides()

        # 3. Evict cache entry if caller signals update (existing chars only)
        if update_database and selected_entity:
            self._character_cache.pop(selected_entity, None)

        # 4. Existing character path — resolve via URI mapping
        if selected_entity:
            if not hasattr(self, "_name_to_uri") or not self._name_to_uri:
                self.get_entity_options()
            uri = self._name_to_uri.get(selected_entity)
            if uri:
                # Known existing character — read NAP + serve from cache
                if selected_entity not in self._character_cache:
                    try:
                        character_manifest = self._fetch_character_data(selected_entity)
                        if "error" in character_manifest:
                            return Data(data=character_manifest)
                        self._character_cache[selected_entity] = character_manifest
                    except ValueError as exc:
                        logger.error(f"Failed to fetch character '{selected_entity}': {exc}")
                        return Data(data={"error": str(exc)})
                manifest = dict(self._character_cache[selected_entity])
                if updated_data:
                    manifest.update(self._to_manifest_patch(updated_data))
                return Data(data=manifest)
            # Typed new name not in URI mapping → fall through to draft

        # 5. Draft generation via LLM
        generation_prompt = getattr(self, _GENERATION_PROMPT, None) or ""
        if generation_prompt:
            if selected_entity:
                generation_prompt = f"Character name: {selected_entity}\n\n{generation_prompt}"
            return self._generate_character_draft(generation_prompt)

        # 6. Nothing to produce
        return Data(data={"info": "No character selected and no generation prompt provided."})

    async def character_response(self) -> Message:
        """Generate a persona-driven LLM response as the selected character.

        Execution flow
        --------------
        1. Validates that a character is selected.
        2. Fetches character data from the NAP universe (served from cache when
           ``build()`` already ran for the same entity).
        3. Overlays any profile-field input values on top of the manifest record.
        4. Constructs a system prompt from the merged character profile.
        5. Invokes the connected language model with the user's input message.
        6. Returns the model's response as a ``Message``.

        Raises:
        ------
        ValueError
            If no character is selected, the character is not found in the
            NAP universe, or no language model is connected.
        """
        entity_name = getattr(self, _SELECTED_ENTITY, None)
        _validate_selected_entity(entity_name)

        # 1. Fetch character data (from cache or NAP).
        try:
            character_manifest = self._fetch_character_data(entity_name)
        except ValueError as exc:
            logger.error(f"Character '{entity_name}' not found for response generation: {exc}")
            raise

        # 2. Overlay input-driven profile edits on top of the manifest record.
        updated_data = self._collect_profile_overrides()
        character_manifest.update(self._to_manifest_patch(updated_data))

        logger.debug(
            "Generating character response for '%s' with %d field(s).",
            entity_name,
            len(character_manifest),
        )

        # 3. Build persona system prompt.
        system_prompt = self._build_character_system_prompt(character_manifest)

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

    def get_entity_options(self) -> list[str]:
        """Dynamically fetch character names from the NAP universe."""
        try:
            characters = self.get_entities("character")
            if not characters:
                return []
            # Build name-to-URI mapping for existing character detection
            self._name_to_uri = {c.get("name", c.get("id", "(unnamed)")): c.get("uri", "") for c in characters}
            names = list(self._name_to_uri.keys())
            return sorted(names)
        except Exception as exc:
            logger.warning(f"Failed to fetch character options: {exc}")
            return []

    def _collect_profile_overrides(self) -> dict[str, object]:
        """Gather non-empty profile-field values from the component's input ports.

        Returns a dict keyed by **input name** (not manifest field).
        """
        overrides: dict[str, object] = {}
        for field_name in _PROFILE_FIELDS:
            value = getattr(self, field_name, None)
            if value is not None and value != "":
                overrides[field_name] = value
        return overrides

    @staticmethod
    def _to_manifest_patch(input_overrides: dict[str, object]) -> dict[str, object]:
        """Translate input-name keys to manifest field keys.

        Only known mappings are included; unknown keys are silently dropped.
        Fields that arrive as a comma-separated string (e.g. ``aliases``)
        are automatically converted to ``list[str]``.
        """
        _string_to_list = frozenset({"aliases"})

        patch: dict[str, object] = {}
        for input_name, value in input_overrides.items():
            manifest_field = _INPUT_TO_MANIFEST_FIELD.get(input_name)
            if not manifest_field:
                continue

            if manifest_field in _string_to_list and isinstance(value, str):
                patch[manifest_field] = [s.strip() for s in value.split(",") if s.strip()]
            else:
                patch[manifest_field] = value
        return patch

    def _generate_character_draft(self, generation_prompt: str) -> Data:
        """Generate a character draft using LLM based on the provided prompt.

        Args:
            generation_prompt: The prompt to send to the LLM for character generation.

        Returns:
            Data containing the generated character draft manifest.
        """
        try:
            model = getattr(self, "model", None)
            if not model:
                return Data(data={"error": "A Language Model must be connected to generate character drafts."})

            # Build a simple system prompt for character generation
            system_prompt = (
                "You are a creative writing assistant. Generate a character manifest "
                "based on the user's prompt. Return a JSON object with character details "
                "including name, aliases (if any), physical_traits (as JSON), state (as JSON), "
                "and any other relevant character information."
            )

            # Build the LLM runnable
            runnable = self.build_model()

            # Invoke the LLM
            result = runnable.invoke(
                input=generation_prompt,
                config={"run_name": "character_draft_generation"},
            )

            # Try to parse the result as JSON
            try:
                draft_manifest = json.loads(result.content if hasattr(result, "content") else str(result))
                logger.info(f"Generated character draft: {draft_manifest}")
                return Data(data=draft_manifest)
            except json.JSONDecodeError as exc:
                logger.error(f"Failed to parse LLM response as JSON: {exc}")
                # Return the raw text as a fallback
                return Data(
                    data={
                        "name": "Draft Character",
                        "description": result.content if hasattr(result, "content") else str(result),
                        "info": "LLM response could not be parsed as JSON. Raw text returned.",
                    }
                )

        except Exception as exc:
            logger.error(f"Failed to generate character draft: {exc}")
            return Data(data={"error": f"Failed to generate character draft: {exc!s}"})

    def _fetch_character_data(self, entity_name: str) -> dict:
        """Fetch character data from the NAP universe with instance-level caching.

        Results are cached per entity name within a single component execution
        so that both ``build()`` and ``character_response()`` can share the
        same manifest record without a redundant NAP resolution.
        """
        if not hasattr(self, "_character_cache") or self._character_cache is None:
            self._character_cache = {}

        cached = self._character_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for character '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for character '%s' — reading from NAP.", entity_name)

        try:
            characters = self.get_entities("character")
        except Exception as exc:
            msg = f"Failed to list characters from NAP universe: {exc}"
            raise ValueError(msg) from exc

        # Match by name
        match = None
        for c in characters:
            if c.get("name") == entity_name:
                match = c
                break

        if match is None:
            msg = f"Character '{entity_name}' not found in NAP universe."
            raise ValueError(msg)

        self._character_cache[entity_name] = match
        return match

    @staticmethod
    def _build_character_system_prompt(character_manifest: dict) -> str:
        """Construct a persona-driven system prompt from character manifest data.

        Parameters
        ----------
        character_manifest : dict
            A dictionary with keys from the character manifest, typically
            ``name``, ``aliases``, ``physical_traits``, ``state``, and
            optionally ``guidance_level``.

        Returns:
        -------
        str
            A system-prompt string that instructs the LLM to roleplay as the
            character.
        """
        name: str = character_manifest.get("name", "Unknown Character") or "Unknown Character"
        aliases: list[str] = character_manifest.get("aliases") or []
        physical_traits: dict | None = character_manifest.get("physical_traits")
        state: dict | None = character_manifest.get("state")
        guidance_level: int | None = character_manifest.get("guidance_level")

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
            "No characters found",
            "No characters found in universe",
        }
    )
    if entity_name in placeholder_messages:
        msg = (
            f"No character available ('{entity_name}'). Ensure the project has characters before using this component."
        )
        raise ValueError(msg)
