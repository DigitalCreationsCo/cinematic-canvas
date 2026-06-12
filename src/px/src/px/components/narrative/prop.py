from __future__ import annotations

from portals.schema import Data
from portals.services.database.models.prop.model import Prop

from px.base.models.model import LCModelComponent
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.io import (
    BoolInput,
    DropdownInput,
    Output,
)
from px.log.logger import logger


class PropComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display prop details and return the prop record.

    This component reads prop records from the ``props`` table scoped to
    the current project. It exposes a single output:

    * **prop_data** — raw prop record for downstream narrative processing.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are prop-specific (prop_data, prop_response) rather than
    # the generic model-output names (text_output, model_output).
    def _validate_outputs(self) -> None:
        """Validate that every declared output has a corresponding method."""
        if self.selected_output is not None and self.selected_output not in self._outputs_map:
            output_names = ", ".join(self._outputs_map)
            msg = f"selected_output '{self.selected_output}' is not valid. Must be one of: {output_names}"
            raise ValueError(msg)

    display_name = "Prop"
    description = "Display prop details and generate prop-aware LLM responses."
    icon = "package"
    name = "Prop"
    minimized = True

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Prop
    storyboard_key = "props"

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → prop_dict so that graph executions referencing
    # both outputs for the same prop only hit the database once.
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
                "info": "If true, the prop's record will be updated with the traits/state below.",
                "advanced": False,
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    inputs = [
        DropdownInput(name="selected_entity", display_name="Select Prop"),
        BoolInput(name="update_database", display_name="Patch Database?", value=False),
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Prop Data", name="prop_data", method="build"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected prop from the database and return it as structured Data.

        Results are cached per entity name so that repeated calls within
        the same execution avoid a redundant database round-trip.

        When ``update_database`` is ``True`` the cache entry for the entity is
        evicted before reading, ensuring the next read fetches fresh data.
        """
        # Evict cache when the caller signals a database mutation.
        if update_database:
            self._prop_cache.pop(selected_entity, None)
            logger.debug(f"Cache evicted for prop '{selected_entity}' after patch.")

        try:
            prop_dict = self._fetch_prop_data(selected_entity)
            return Data(data=prop_dict)
        except ValueError as exc:
            logger.error(f"Failed to fetch prop '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _fetch_prop_data(self, entity_name: str) -> dict:
        """Fetch prop data from the database with instance-level caching.

        Results are cached per entity name within a single component execution
        so that ``build()`` shares the same database record without a redundant read.
        """
        # Lazy-init the cache so subclasses or direct __new__ usage doesn't break.
        if not hasattr(self, "_prop_cache") or self._prop_cache is None:
            self._prop_cache = {}

        # Return cached data when available.
        cached = self._prop_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for prop '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for prop '%s' — reading from database.", entity_name)

        # Read from DB via the shared base-entity logic.
        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        # Surface DB-level errors (e.g. prop not found).
        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        # Cache and return the raw dictionary.
        prop_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._prop_cache[entity_name] = prop_dict
        return prop_dict
