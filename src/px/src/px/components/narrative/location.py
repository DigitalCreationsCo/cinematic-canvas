from __future__ import annotations

from portals.schema import Data
from portals.services.database.models.location.model import Location

from px.base.models.model import LCModelComponent
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.field_typing.range_spec import RangeSpec
from px.io import (
    BoolInput,
    DictInput,
    DropdownInput,
    Output,
    SliderInput,
    StrInput,
)
from px.log.logger import logger

# ── Field name constants ─────────────────────────────────────────────

_SELECTED_ENTITY = "selected_entity"
_UPDATE_DB = "update_database"
_LOCATION_NAME = "location_name"
_LOCATION_TYPE = "location_type"
_MOOD = "mood"
_LIGHTING_CONDITIONS = "lighting_conditions"
_TIME_OF_DAY = "time_of_day"
_WEATHER = "weather"
_COLOR_PALETTE = "color_palette"
_ARCHITECTURE = "architecture"
_NATURAL_ELEMENTS = "natural_elements"
_MAN_MADE_OBJECTS = "man_made_objects"
_GROUND_SURFACE = "ground_surface"
_SKY_OR_CEILING = "sky_or_ceiling"
_STATE = "state"
_GUIDANCE_LEVEL = "guidance_level"

_PROFILE_FIELDS = (
    _LOCATION_NAME,
    _LOCATION_TYPE,
    _MOOD,
    _LIGHTING_CONDITIONS,
    _TIME_OF_DAY,
    _WEATHER,
    _COLOR_PALETTE,
    _ARCHITECTURE,
    _NATURAL_ELEMENTS,
    _MAN_MADE_OBJECTS,
    _GROUND_SURFACE,
    _SKY_OR_CEILING,
    _STATE,
    _GUIDANCE_LEVEL,
)

_INPUT_TO_MODEL_FIELD = {
    _LOCATION_NAME: "name",
    _LOCATION_TYPE: "type",
    _MOOD: "mood",
    _LIGHTING_CONDITIONS: "lighting_conditions",
    _TIME_OF_DAY: "time_of_day",
    _WEATHER: "weather",
    _COLOR_PALETTE: "color_palette",
    _ARCHITECTURE: "architecture",
    _NATURAL_ELEMENTS: "natural_elements",
    _MAN_MADE_OBJECTS: "man_made_objects",
    _GROUND_SURFACE: "ground_surface",
    _SKY_OR_CEILING: "sky_or_ceiling",
    _STATE: "state",
    _GUIDANCE_LEVEL: "guidance_level",
}


class LocationComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display location details and return the location record.

    This component reads location records from the ``locations`` table scoped to
    the current project. It exposes a single output:

    * **location_data** — raw location record for downstream narrative processing.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are location-specific (location_data) rather than
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
            _SELECTED_ENTITY: {
                "display_name": "Select Location",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch Database?",
                "info": "If true, the location's record will be updated with the traits/state below.",
                "advanced": False,
            },
            _LOCATION_NAME: {
                "display_name": "Name",
                "info": "Location's display name.",
            },
            _LOCATION_TYPE: {
                "display_name": "Type",
                "info": "Category of location (e.g. forest, castle, street).",
            },
            _MOOD: {
                "display_name": "Mood",
                "info": "Atmosphere or emotional tone of the location.",
            },
            _LIGHTING_CONDITIONS: {
                "display_name": "Lighting Conditions",
                "info": "Lighting description as a JSON object.",
            },
            _TIME_OF_DAY: {
                "display_name": "Time of Day",
                "info": "When this location is typically seen (e.g. dawn, night).",
            },
            _WEATHER: {
                "display_name": "Weather",
                "info": "Weather conditions at this location.",
            },
            _COLOR_PALETTE: {
                "display_name": "Color Palette",
                "info": "Dominant colors as a JSON object.",
            },
            _ARCHITECTURE: {
                "display_name": "Architecture",
                "info": "Architectural style details as a JSON object.",
            },
            _NATURAL_ELEMENTS: {
                "display_name": "Natural Elements",
                "info": "Natural features as a JSON object.",
            },
            _MAN_MADE_OBJECTS: {
                "display_name": "Man-made Objects",
                "info": "Structures and objects as a JSON object.",
            },
            _GROUND_SURFACE: {
                "display_name": "Ground Surface",
                "info": "Description of the ground surface.",
            },
            _SKY_OR_CEILING: {
                "display_name": "Sky or Ceiling",
                "info": "Description of the sky or ceiling.",
            },
            _STATE: {
                "display_name": "State",
                "info": "Current narrative state as a JSON object.",
            },
            _GUIDANCE_LEVEL: {
                "display_name": "Guidance Level",
                "info": "Controls how closely the model should follow the location profile.",
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    _profile_inputs = [
        StrInput(
            name=_LOCATION_NAME,
            display_name="Name",
            info="Location's display name.",
            value="",
        ),
        StrInput(
            name=_LOCATION_TYPE,
            display_name="Type",
            info="Category of location (e.g. forest, castle, street).",
            value="",
        ),
        StrInput(
            name=_MOOD,
            display_name="Mood",
            info="Atmosphere or emotional tone of the location.",
            value="",
        ),
        DictInput(
            name=_LIGHTING_CONDITIONS,
            display_name="Lighting Conditions",
            info="Lighting description as a JSON object.",
            advanced=True,
        ),
        StrInput(
            name=_TIME_OF_DAY,
            display_name="Time of Day",
            info="When this location is typically seen (e.g. dawn, night).",
            value="",
            advanced=True,
        ),
        StrInput(
            name=_WEATHER,
            display_name="Weather",
            info="Weather conditions at this location.",
            value="",
            advanced=True,
        ),
        DictInput(
            name=_COLOR_PALETTE,
            display_name="Color Palette",
            info="Dominant colors as a JSON object.",
            advanced=True,
        ),
        DictInput(
            name=_ARCHITECTURE,
            display_name="Architecture",
            info="Architectural style details as a JSON object.",
            advanced=True,
        ),
        DictInput(
            name=_NATURAL_ELEMENTS,
            display_name="Natural Elements",
            info="Natural features as a JSON object.",
            advanced=True,
        ),
        DictInput(
            name=_MAN_MADE_OBJECTS,
            display_name="Man-made Objects",
            info="Structures and objects as a JSON object.",
            advanced=True,
        ),
        StrInput(
            name=_GROUND_SURFACE,
            display_name="Ground Surface",
            info="Description of the ground surface.",
            value="",
            advanced=True,
        ),
        StrInput(
            name=_SKY_OR_CEILING,
            display_name="Sky or Ceiling",
            info="Description of the sky or ceiling.",
            value="",
            advanced=True,
        ),
        DictInput(
            name=_STATE,
            display_name="State",
            info="Current narrative state as a JSON object.",
            advanced=True,
        ),
        SliderInput(
            name=_GUIDANCE_LEVEL,
            display_name="Guidance Level",
            info="Controls how closely the model should follow the location profile.",
            value=5,
            range_spec=RangeSpec(min=0, max=10, step=1),
            advanced=True,
        ),
    ]

    inputs = [
        DropdownInput(name=_SELECTED_ENTITY, display_name="Select Location"),
        BoolInput(name=_UPDATE_DB, display_name="Patch Database?", value=False),
        *_profile_inputs,
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Location Data", name="location_data", method="build"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected location from the database and return it as structured Data.

        Results are cached per entity name so that repeated calls within
        the same execution avoid a redundant database round-trip.

        When ``update_database`` is ``True`` the profile fields are patched
        to the database before reading.
        """
        # 1. Collect any profile-field overrides supplied via inputs.
        updated_data = self._collect_profile_overrides()

        # 2. When the caller signals a database mutation, perform the patch.
        if update_database:
            model_updates = self._to_model_patch(updated_data)
            if model_updates:
                self._location_cache.pop(selected_entity, None)
                logger.debug(f"Patching location '{selected_entity}' with {model_updates}")
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
                    logger.error(f"Patch failed for location '{selected_entity}': {patch_result.data['error']}")
                    return patch_result

        # 3. Read from DB (fresh or cached).
        try:
            location_dict = self._fetch_location_data(selected_entity)
        except ValueError as exc:
            logger.error(f"Failed to fetch location '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

        # 4. Overlay input-driven overrides so the output reflects edits.
        location_dict.update(self._to_model_patch(updated_data))

        return Data(data=location_dict)

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _collect_profile_overrides(self) -> dict[str, object]:
        """Gather non-empty profile-field values from the component's input ports."""
        overrides: dict[str, object] = {}
        for field_name in _PROFILE_FIELDS:
            value = getattr(self, field_name, None)
            if value is not None and value != "":
                overrides[field_name] = value
        return overrides

    @staticmethod
    def _to_model_patch(input_overrides: dict[str, object]) -> dict[str, object]:
        """Translate input-name keys to model-field keys."""
        patch: dict[str, object] = {}
        for input_name, value in input_overrides.items():
            model_field = _INPUT_TO_MODEL_FIELD.get(input_name)
            if model_field:
                patch[model_field] = value
        return patch

    def _fetch_location_data(self, entity_name: str) -> dict:
        """Fetch location data from the database with instance-level caching.

        Results are cached per entity name within a single component execution
        so that ``build()`` shares the same database record without a redundant read.
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
