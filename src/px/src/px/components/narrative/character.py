from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from portals.schema import Data

from px.base.models.model import LCModelComponent
from px.base.models.unified_models import get_llm
from px.base.prompts.character_image_prompt import build_character_image_prompt
from px.components.narrative.base_state_aware import BaseStateAwareComponent
from px.components.tools.generate_characters import (
    CHARACTER_GENERATION_SYSTEM_PROMPT,
    GeneratedCharacter,
)
from px.field_typing.constants import LanguageModel  # noqa: TC001
from px.field_typing.range_spec import RangeSpec
from px.io import (
    BoolInput,
    DictInput,
    DropdownInput,
    MessageInput,
    MessageTextInput,
    ModelInput,
    MultilineInput,
    Output,
    SecretStrInput,
    SliderInput,
    StrInput,
)
from px.log.logger import logger
from px.schema.message import Message  # noqa: TC001
from px.services.nap_service import EntityNotFoundError, InvalidUriError
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

_PROFILE_FIELDS = (
    _CHARACTER_NAME,
    _ALIASES,
    _PHYSICAL_TRAITS,
    _STATE,
    _GUIDANCE_LEVEL,
)

_INPUT_TO_MANIFEST_FIELD = {
    _CHARACTER_NAME: "name",
    _ALIASES: "aliases",
    _PHYSICAL_TRAITS: "physical_traits",
    _STATE: "state",
    _GUIDANCE_LEVEL: "guidance_level",
}


class CharacterComponent(BaseStateAwareComponent, LCModelComponent):
    """Display character details and generate persona-driven LLM responses.

    Supports two workflows:

    **Existing Character**
        Select a character from the dropdown populated from the active
        project's NAP repository. The complete manifest is loaded and
        made available for downstream narrative processing. Persona-driven
        chat uses the selected manifest.

    **Draft Character**
        When no character is selected, provide a ``generation_prompt``
        to generate a structured character manifest via LLM. Optionally
        generate an avatar after character generation (fire-and-forget).

    This component is **read-only** with respect to NAP repositories.
    Publishing generated manifests is owned by the frontend merge/publish
    workflow.
    """

    # ── LCModelComponent override ──────────────────────────────────

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

    # ── Instance-level caches ──────────────────────────────────────
    # entity_key (display name) → character manifest dict
    _character_cache: dict[str, dict]
    # display name → NAP URI
    _name_to_uri: dict[str, str]

    # ── Config ─────────────────────────────────────────────────────

    def build_config(self):
        return {
            _SELECTED_ENTITY: {
                "display_name": "Character Name",
                "info": "Type a character name. Existing characters appear as suggestions — select to load. Type a new name to create.",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch NAP Manifest?",
                "info": ("If true, the character's cached manifest is evicted and re-read from the NAP repository."),
                "advanced": False,
            },
            _GENERATION_PROMPT: {
                "display_name": "Generation Prompt",
                "info": "Describe the character to generate. Required when creating a new character.",
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

    # ── Input ports ────────────────────────────────────────────────

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
        DropdownInput(
            name=_SELECTED_ENTITY,
            display_name="Character Name",
            value="",
            combobox=True,
        ),
        BoolInput(name=_UPDATE_DB, display_name="Patch NAP Manifest?", value=False),
        MultilineInput(
            name=_GENERATION_PROMPT,
            display_name="Generation Prompt",
            info=("Describe the character to generate. Required when creating a new character."),
            value="",
        ),
        ModelInput(
            name="model",
            display_name="Language Model",
            info="Select your model provider",
            real_time_refresh=True,
            required=True,
        ),
        ModelInput(
            name="image_model",
            display_name="Image Model",
            model_type="image_generation",
            info="Optional image model for generating character avatars.",
            required=False,
        ),
        MessageInput(
            name="input_value",
            display_name="Input",
            info="The input text to send to the model.",
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

    # ── Output ports ───────────────────────────────────────────────

    outputs = [
        Output(display_name="Character Data", name="character_data", method="build"),
        Output(display_name="Character Response", name="character_response", method="character_response"),
    ]

    # ═══════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════

    def build(
        self,
        selected_entity: str = "",
        *,
        update_database: bool = False,
    ) -> Data:
        """Return character data for the selected or generated character.

        Two modes:

        * **Existing character**: *selected_entity* is a display name
          from the dropdown. The character manifest is read from the NAP
          universe (cached per entity key within a single execution).
        * **Draft generation**: *selected_entity* is empty and
          ``generation_prompt`` is set. A structured character is
          generated via LLM. The result is a draft manifest — it is
          **not** automatically published.

        Profile-field overrides supplied via inputs are merged on top of
        the manifest so downstream consumers always receive the most
        current view.
        """
        # 1. Ensure the instance-level cache is initialised.
        if not hasattr(self, "_character_cache") or self._character_cache is None:
            self._character_cache = {}

        # 2. Collect profile-field overrides from input ports.
        updated_data = self._collect_profile_overrides()

        # 3. When the caller signals an update, evict the cache entry.
        if update_database and selected_entity:
            self._character_cache.pop(selected_entity, None)
            logger.info(
                "Character cache evicted for '%s'. Updates must go through the NAP API (POST /nap/publish).",
                selected_entity,
            )

        # 4. Existing character path — resolve via URI mapping
        if selected_entity:
            if not hasattr(self, "_name_to_uri") or not self._name_to_uri:
                self.get_entity_options()
            uri = self._name_to_uri.get(selected_entity)
            if uri:
                # Known existing character — read NAP + serve from cache
                if selected_entity not in self._character_cache:
                    result = self._execute_read_patch_logic(
                        selected_entity,
                        update_database=update_database,
                        updated_data={},
                    )
                    if "error" in result.data:
                        return result
                    self._character_cache[selected_entity] = result.data
                manifest = dict(self._character_cache[selected_entity])
                if updated_data:
                    manifest.update(self._to_manifest_patch(updated_data))
                return Data(data=manifest)
            # Typed name not in URI mapping → fall through to draft generation

        # 5. Draft generation
        generation_prompt = getattr(self, _GENERATION_PROMPT, None) or ""
        if generation_prompt:
            if selected_entity:
                generation_prompt = f"Character name: {selected_entity}\n\n{generation_prompt}"
            return self._generate_character_draft(generation_prompt)

        # 6. Nothing to produce.
        return Data(data={"info": "No character selected and no generation prompt provided."})

    async def character_response(self) -> Message:
        """Generate a persona-driven LLM response as the selected character.

        Steps
        -----
        1. Validates a character is selected.
        2. Fetches character data from the NAP universe (cache if
           ``build()`` already ran for the same entity).
        3. Overlays profile-field input values.
        4. Constructs a system prompt from the merged profile.
        5. Invokes the LLM with the user's message.
        6. Returns the model response as a ``Message``.

        Raises:
        ------
        ValueError
            If no character is selected, the character is not found in
            the NAP universe, or no language model is connected.
        """
        entity_key = getattr(self, _SELECTED_ENTITY, None)
        _validate_selected_entity(entity_key)

        # 1. Fetch character data (from cache or NAP).
        try:
            character_manifest = self._fetch_character_data(entity_key)
        except ValueError as exc:
            logger.error("Character '%s' not found for response generation: %s", entity_key, exc)
            raise

        # 2. Overlay input-driven profile edits.
        updated_data = self._collect_profile_overrides()
        if updated_data:
            character_manifest.update(self._to_manifest_patch(updated_data))

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

    # ═══════════════════════════════════════════════════════════════════
    # LLM INTEGRATION
    # ═══════════════════════════════════════════════════════════════════

    def build_model(self) -> LanguageModel:
        """Build the language model from the configured model input."""
        return get_llm(
            model=self.model,
            user_id=self.user_id,
            api_key=getattr(self, "api_key", None),
            temperature=getattr(self, "temperature", 0.5),
            stream=getattr(self, "stream", False),
        )

    # ═══════════════════════════════════════════════════════════════════
    # DROPDOWN / ENTITY OPTIONS
    # ═══════════════════════════════════════════════════════════════════

    def get_entity_options(self) -> list[str]:
        """Fetch character names from the NAP universe for the dropdown.

        Also builds ``_name_to_uri`` so that internal operations resolve
        display names to NAP URIs. The dropdown displays names; all
        internal storage and lookups use URIs.
        """
        self._name_to_uri = {}
        try:
            characters = self.get_entities("character")
            if not characters:
                return []
            names: list[str] = []
            for c in characters:
                name = c.get("name", c.get("id", "(unnamed)"))
                uri = c.get("uri", "")
                names.append(name)
                if uri:
                    self._name_to_uri[name] = uri
            return sorted(names)
        except (KeyError, TypeError) as exc:
            logger.warning("Failed to fetch character options: %s", exc)
            return []

    # ═══════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════

    def _resolve_uri(self, entity_key: str) -> str:
        """Resolve an entity key to a NAP URI.

        If the key already looks like a URI (starts with ``nap://``) it
        is returned as-is. Otherwise it is treated as a display name and
        looked up in ``_name_to_uri``. If the mapping is not yet built,
        it is lazily initialised.

        Raises:
            ValueError: If the entity key cannot be resolved.
        """
        if entity_key.startswith("nap://"):
            return entity_key

        if not hasattr(self, "_name_to_uri") or not self._name_to_uri:
            self.get_entity_options()

        uri = self._name_to_uri.get(entity_key)
        if not uri:
            msg = f"Character '{entity_key}' not found in NAP universe."
            raise ValueError(msg)
        return uri

    def _execute_read_patch_logic(
        self,
        entity_key: str,
        *,
        update_database: bool = False,
        updated_data: dict[str, object] | None = None,
    ) -> Data:
        """Read character manifest from the NAP universe.

        Parameters
        ----------
        entity_key:
            Character display name (resolved to URI internally) or a
            direct NAP URI.
        update_database:
            Unused in this read-only component; accepted for interface
            compatibility.
        updated_data:
            Optional profile-field overrides keyed by input name.

        Returns:
            ``Data`` containing either the manifest dict or an
            ``{"error": ...}`` dict.
        """
        _ = update_database  # read-only — discard
        try:
            uri = self._resolve_uri(entity_key)
            manifest = self.get_entity(uri)
        except (EntityNotFoundError, InvalidUriError, ValueError) as exc:
            logger.error("Failed to read character '%s': %s", entity_key, exc)
            return Data(data={"error": str(exc)})

        if updated_data:
            manifest.update(self._to_manifest_patch(updated_data))

        return Data(data=manifest)

    def _fetch_character_data(self, entity_key: str) -> dict:
        """Fetch character manifest with instance-level caching.

        Cache key is the entity key (display name) so that both
        ``build()`` and ``character_response()`` can share the same
        manifest record without redundant NAP resolutions.
        """
        if not hasattr(self, "_character_cache") or self._character_cache is None:
            self._character_cache = {}

        cached = self._character_cache.get(entity_key)
        if cached is not None:
            logger.debug("Cache hit for character '%s'.", entity_key)
            return cached

        result = self._execute_read_patch_logic(
            entity_key,
            update_database=False,
            updated_data={},
        )

        if "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        self._character_cache[entity_key] = result.data
        return result.data

    def _collect_profile_overrides(self) -> dict[str, object]:
        """Gather non-empty profile-field values from input ports.

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
        are converted to ``list[str]``.
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

    @staticmethod
    def _build_character_system_prompt(manifest: dict) -> str:
        """Construct a persona-driven system prompt from character manifest data.

        Parameters
        ----------
        manifest:
            A dict with keys from the character manifest, typically
            ``name``, ``aliases``, ``physical_traits``, ``state``,
            ``description``, and optionally ``guidance_level``.

        Returns:
            A system-prompt string that instructs the LLM to roleplay
            as the character.
        """
        name: str = manifest.get("name", "Unknown Character") or "Unknown Character"
        aliases: list[str] = manifest.get("aliases") or []
        physical_traits: dict | None = manifest.get("physical_traits")
        state: dict | None = manifest.get("state")
        guidance_level: int | None = manifest.get("guidance_level")
        description: str = manifest.get("description", "")

        parts: list[str] = [
            f"You are roleplaying as {name}. Respond as this character would, "
            "staying true to their personality, knowledge, mannerisms, and circumstances. "
            "Never break character. Do not refer to yourself as an AI or language model."
        ]

        if description:
            parts.append(f"\nCharacter background: {description}")

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

    # ═══════════════════════════════════════════════════════════════════
    # DRAFT CHARACTER GENERATION
    # ═══════════════════════════════════════════════════════════════════

    def _generate_character_draft(self, prompt: str) -> Data:
        """Generate a structured character manifest via LLM.

        Uses the ``model`` input for LLM structured output and the
        existing ``GeneratedCharacter`` schema. The result is a draft
        manifest dict — it is **never** automatically published.

        If ``image_model`` is configured, avatar generation is
        dispatched as a fire-and-forget background task.
        """
        model = getattr(self, "model", None)
        if not model:
            return Data(
                data={"error": "A Language Model must be connected to generate characters."},
            )

        try:
            llm = get_llm(model=model, user_id=self.user_id)
        except ValueError as exc:
            logger.exception("Failed to instantiate LLM for character generation")
            return Data(data={"error": f"Failed to instantiate LLM: {exc}"})

        if not hasattr(llm, "with_structured_output"):
            return Data(
                data={
                    "error": (
                        "The selected model does not support structured output. "
                        "Choose a model that supports function/tool calling "
                        "(e.g. GPT-4o, Claude 3, Gemini)."
                    ),
                },
            )

        try:
            from pydantic import Field, create_model

            outer_schema = create_model(
                "GeneratedCharacterList",
                characters=(
                    list[GeneratedCharacter],
                    Field(..., min_length=1, max_length=1, description="Exactly 1 character."),
                ),
            )
            structured_llm = llm.with_structured_output(outer_schema, method="function_calling")
            user_message = f"Generate exactly 1 character with a unique reference_id and name for:\n\n{prompt}"
            result = structured_llm.invoke(
                [
                    {"role": "system", "content": CHARACTER_GENERATION_SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ]
            )

            if not result or not result.characters:
                return Data(data={"error": "LLM returned an empty character list."})

            char_data = result.characters[0]
            manifest = self._generated_char_to_manifest(char_data)

            # Optionally dispatch avatar generation
            image_model = getattr(self, "image_model", None)
            if image_model:
                self._schedule_avatar_generation(manifest)

            return Data(data=manifest)

        except Exception as exc:  # noqa: BLE001 — safety net for LLM API / structured output errors
            logger.exception("Character generation failed")
            return Data(data={"error": f"Character generation failed: {exc}"})

    @staticmethod
    def _generated_char_to_manifest(char_data: GeneratedCharacter) -> dict[str, Any]:
        """Convert a ``GeneratedCharacter`` to a NAP-compatible manifest dict.

        The result is a flat manifest dict with all fields from the
        generated schema plus NAP-compatible fields.
        """
        manifest: dict[str, Any] = {
            "name": char_data.name,
            "description": char_data.description,
            "aliases": char_data.aliases,
            "physical_traits": char_data.physical_traits.model_dump(mode="json"),
            "state": char_data.state,
            "entity_id": char_data.reference_id,
            "representations": {},
            "references": {},
            "metadata": {"generated": True, "source": "llm"},
        }
        if char_data.guidance_level is not None:
            manifest["guidance_level"] = char_data.guidance_level
        return manifest

    # ═══════════════════════════════════════════════════════════════════
    # AVATAR GENERATION (fire-and-forget)
    # ═══════════════════════════════════════════════════════════════════

    def _schedule_avatar_generation(self, manifest: dict[str, Any]) -> None:
        """Dispatch background avatar generation.

        Uses the character profile as the image prompt. The avatar is
        generated asynchronously — the draft manifest is returned
        immediately without waiting.
        """
        image_model = getattr(self, "image_model", None)
        if not image_model:
            return

        try:
            image_llm = get_llm(model=image_model, user_id=self.user_id)
        except ValueError:
            logger.exception("Failed to initialise image model — avatar generation disabled")
            return

        event_manager = getattr(self, "_event_manager", None)

        async def _dispatch():
            from portals.services.deps import get_task_service

            task_service = get_task_service()
            if not task_service:
                logger.warning("No TaskService available — skipping avatar generation")
                return

            await task_service.fire_and_forget_task(
                _generate_avatar_background,
                character=manifest,
                image_llm=image_llm,
                event_manager=event_manager,
            )

        try:
            loop = asyncio.get_running_loop()
            task = loop.create_task(_dispatch())
            logger.info(
                "Scheduled background avatar generation for '%s' (task %s)",
                manifest.get("name", "unknown"),
                id(task),
            )
        except RuntimeError:
            logger.warning(
                "No running event loop — skipping background avatar generation",
            )


# ═══════════════════════════════════════════════════════════════════════
# MODULE-LEVEL HELPERS
# ═══════════════════════════════════════════════════════════════════════


async def _generate_avatar_background(
    character: dict[str, Any],
    image_llm: Any,
    event_manager: Any | None,
) -> None:
    """Background task: generate an avatar for a single character.

    Called via ``TaskService.fire_and_forget_task``. The character
    profile is used as the image prompt. When complete, an SSE event
    is emitted so the frontend can update the draft manifest.
    """
    task_logger = logging.getLogger(f"{__name__}._generate_avatar_background")
    char_name = character.get("name", character.get("entity_id", "unknown"))

    try:
        prompt = build_character_image_prompt(character)
        task_logger.info("Generating avatar for character '%s'", char_name)
        result = image_llm.invoke(prompt)
        image_data = _extract_image_data(result)

        if image_data:
            task_logger.info("Avatar generated for '%s'", char_name)
            if event_manager:
                try:
                    event_manager.on_custom_event(
                        data={
                            "event_type": "entity_updated",
                            "payload": {
                                "id": character.get("entity_id", char_name),
                                "type": "CharacterComponent",
                                "data": {
                                    "avatar_generated": True,
                                    "image_data": image_data,
                                },
                            },
                        }
                    )
                except Exception:
                    task_logger.exception("Failed to emit SSE event for %s", char_name)
        else:
            task_logger.warning("Image model returned no usable result for '%s'", char_name)

    except Exception:
        task_logger.exception("Failed to generate avatar for '%s'", char_name)
        if event_manager:
            try:
                event_manager.on_custom_event(
                    data={
                        "event_type": "entity_error",
                        "payload": {
                            "id": character.get("entity_id", char_name),
                            "type": "CharacterComponent",
                            "error": f"Avatar generation failed for {char_name}",
                        },
                    }
                )
            except Exception:
                task_logger.exception("Failed to emit error SSE event for %s", char_name)


def _extract_image_data(result: Any) -> str | None:
    """Extract image data from the image model result.

    Handles various return types: ``bytes``, ``str`` (base64 / URL), or
    a ``dict`` with an ``image`` or ``data`` key.
    """
    if result is None:
        return None
    if isinstance(result, bytes):
        return result.hex()
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        return result.get("image") or result.get("data") or str(result)
    try:
        return str(result)
    except (TypeError, ValueError):
        return None


def _validate_selected_entity(entity_key: str | None) -> None:
    """Validate that ``entity_key`` is a meaningful character selection.

    Raises:
        ValueError: If the entity key is ``None``, empty, or a placeholder
            message returned by ``get_entity_options()``.
    """
    if not entity_key or not entity_key.strip():
        msg = (
            "No character selected. Please select a character from the combobox "
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
    if entity_key in placeholder_messages:
        msg = (
            f"No character available ('{entity_key}'). Ensure the project "
            "has characters before using this component."
        )
        raise ValueError(msg)
