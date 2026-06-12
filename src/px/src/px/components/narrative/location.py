from __future__ import annotations

import json

from portals.schema import Data
from portals.services.database.models.location.model import Location

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


class LocationComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display location details and generate location-aware LLM responses.

    This component reads location records from the ``locations`` table scoped to
    the current project. It exposes two outputs:

    * **location_data** — raw location record for downstream narrative processing.
    * **location_response** — an LLM-generated atmospheric description or analysis
      grounded in the selected location's context.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are location-specific (location_data, location_response) rather than
    # the generic model-output names (text_output, model_output).
    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Location"
    description = "Display location details and generate location-aware LLM responses."
    icon = "map-pin"
    name = "Location"
    minimized = True

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Location
    storyboard_key = "locations"

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → location_dict so that graph executions referencing
    # both outputs for the same location only hit the database once.
    _location_cache: dict[str, dict]

    def build_config(self):
        return {
            "selected_entity": {
                "display_name": "Select Location",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            "update_database": {
                "display_name": "Patch Database?",
                "info": "If true, the location's record will be updated with the traits/state below.",
                "advanced": False,
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    inputs = [
        DropdownInput(name="selected_entity", display_name="Select Location"),
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
        Output(display_name="Location Data", name="location_data", method="build"),
        Output(display_name="Location Response", name="location_response", method="location_response"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected location from the database and return it as structured Data.

        Results are cached per entity name so that a subsequent call to
        ``location_response()`` within the same execution avoids a redundant
        database round-trip.

        When ``update_database`` is ``True`` the cache entry for the entity is
        evicted before reading, ensuring the next read fetches fresh data.
        """
        # Evict cache when the caller signals a database mutation.
        if update_database:
            self._location_cache.pop(selected_entity, None)
            logger.debug(f"Cache evicted for location '{selected_entity}' after patch.")

        try:
            location_dict = self._fetch_location_data(selected_entity)
            return Data(data=location_dict)
        except ValueError as exc:
            logger.error(f"Failed to fetch location '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

    async def location_response(self) -> Message:
        """Generate a location-aware LLM response grounded in the selected location.

        Execution flow
        --------------
        1. Validates that a location is selected.
        2. Fetches location data from the database (served from cache when
           ``build()`` already ran for the same entity).
        3. Constructs a system prompt from the location's profile — name,
           type, mood, weather, architecture, natural elements, and state.
        4. Invokes the connected language model with the user's input message.
        5. Returns the model's response as a ``Message``.

        Raises:
        ------
        ValueError
            If no location is selected, the location is not found in the
            database, or no language model is connected.
        """
        entity_name = getattr(self, "selected_entity", None)
        _validate_selected_location(entity_name)

        # 1. Fetch location data (from cache or DB).
        try:
            location_dict = self._fetch_location_data(entity_name)
        except ValueError as exc:
            logger.error(f"Location '{entity_name}' not found for response generation: {exc}")
            raise

        logger.debug(
            "Generating location response for '%s' with %d field(s).",
            entity_name,
            len(location_dict),
        )

        # 2. Build location-aware system prompt.
        system_prompt = self._build_location_system_prompt(location_dict)

        # 3. Validate model input.
        model = getattr(self, "model", None)
        if not model:
            msg = "A Language Model must be connected to generate location responses."
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

    def _fetch_location_data(self, entity_name: str) -> dict:
        """Fetch location data from the database with instance-level caching.

        Results are cached per entity name within a single component execution
        so that both ``build()`` and ``location_response()`` can share the
        same database record without a redundant read.
        """
        # Lazy-init the cache so subclasses or direct __new__ usage doesn't break.
        if not hasattr(self, "_location_cache") or self._location_cache is None:
            self._location_cache = {}

        # Return cached data when available.
        cached = self._location_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for location '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for location '%s' — reading from database.", entity_name)

        # Read from DB via the shared base-entity logic.
        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        # Surface DB-level errors (e.g. location not found).
        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        # Cache and return the raw dictionary.
        location_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._location_cache[entity_name] = location_dict
        return location_dict

    @staticmethod
    def _build_location_system_prompt(location_dict: dict) -> str:
        """Construct a location-aware system prompt from location data.

        Parameters
        ----------
        location_dict : dict
            A dictionary with keys from the ``Location`` model, typically
            ``name``, ``type``, ``mood``, ``time_of_day``, ``weather``,
            ``architecture``, ``natural_elements``, ``state``, and
            optionally ``guidance_level``.

        Returns:
        -------
        str
            A system-prompt string that instructs the LLM to respond as a
            location-aware narrator grounded in the location's context.
        """
        name: str = location_dict.get("name", "Unknown Location") or "Unknown Location"
        type_: str = location_dict.get("type", "") or ""
        mood: str = location_dict.get("mood", "") or ""
        time_of_day: str = location_dict.get("time_of_day", "") or ""
        weather: str = location_dict.get("weather", "") or ""
        architecture: list[str] | None = location_dict.get("architecture")
        natural_elements: list[str] | None = location_dict.get("natural_elements")
        state: dict | None = location_dict.get("state")
        guidance_level: int | None = location_dict.get("guidance_level")

        parts: list[str] = [
            f'You are a location-aware narrator describing "{name}". '
            "Ground your response in the location's established context — "
            "type, mood, weather, architecture, and natural surroundings. "
            "Never break character. Do not refer to yourself as an AI or language model."
        ]

        if type_:
            parts.append(f"\nLocation type: {type_}.")

        if mood:
            parts.append(f"\nAtmospheric mood: {mood}.")

        if time_of_day:
            parts.append(f"\nTime of day: {time_of_day}.")

        if weather:
            parts.append(f"\nWeather: {weather}.")

        if architecture:
            arch_str = json.dumps(architecture, indent=2)
            parts.append(f"\nArchitectural features:\n```json\n{arch_str}\n```")

        if natural_elements:
            nat_str = json.dumps(natural_elements, indent=2)
            parts.append(f"\nNatural elements:\n```json\n{nat_str}\n```")

        if state:
            state_str = json.dumps(state, indent=2)
            parts.append(f"\nLocation state:\n```json\n{state_str}\n```")

        if guidance_level is not None:
            parts.append(f"\n(Guidance level: {guidance_level})")

        return "\n".join(parts)


# ── Module-level helpers ─────────────────────────────────────────────


def _validate_selected_location(entity_name: str | None) -> None:
    """Validate that ``entity_name`` is a meaningful location selection.

    Raises:
    ------
    ValueError
        If the entity name is ``None``, empty, or one of the placeholder
        messages returned by ``get_entity_options()`` when no entities exist.
    """
    if not entity_name or not entity_name.strip():
        msg = (
            "No location selected. Please select a valid location from the dropdown "
            "or connect a valid location name to the 'selected_entity' input port."
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
        msg = f"No location available ('{entity_name}'). Ensure the project has locations before using this component."
        raise ValueError(msg)
