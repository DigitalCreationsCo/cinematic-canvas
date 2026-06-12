from __future__ import annotations

from portals.schema import Data
from portals.services.database.models.location.model import Location

from px.base.models.model import LCModelComponent
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.io import (
    BoolInput,
    DropdownInput,
    Output,
)
from px.log.logger import logger


class LocationComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display location details and return the location record.

    This component reads location records from the ``locations`` table scoped to
    the current project. It exposes a single output:

    * **location_data** — raw location record for downstream narrative processing.
    """

    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Location"
    description = "Display location details and generate atmospheric LLM responses."
    icon = "map-pin"
    name = "Location"
    minimized = True

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Location
    storyboard_key = "locations"

    # ── Instance-level cache ─────────────────────────────────────────────
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
                "info": "If true, the location's record will be updated.",
                "advanced": False,
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    inputs = [
        DropdownInput(name="selected_entity", display_name="Select Location"),
        BoolInput(name="update_database", display_name="Patch Database?", value=False),
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Location Data", name="location_data", method="build"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        if update_database:
            self._location_cache.pop(selected_entity, None)
            logger.debug(f"Cache evicted for location '{selected_entity}' after patch.")

        try:
            location_dict = self._fetch_location_data(selected_entity)
            return Data(data=location_dict)
        except ValueError as exc:
            logger.error(f"Failed to fetch location '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _fetch_location_data(self, entity_name: str) -> dict:
        if not hasattr(self, "_location_cache") or self._location_cache is None:
            self._location_cache = {}

        cached = self._location_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for location '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for location '%s' — reading from database.", entity_name)

        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        location_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._location_cache[entity_name] = location_dict
        return location_dict
