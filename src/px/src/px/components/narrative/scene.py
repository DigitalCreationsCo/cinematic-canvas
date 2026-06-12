from __future__ import annotations

from portals.schema import Data
from portals.services.database.models.scene.model import Scene

from px.base.models.model import LCModelComponent
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
from px.io import (
    BoolInput,
    DropdownInput,
    Output,
)
from px.log.logger import logger


class SceneComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display scene details and return the scene record.

    This component reads scene records from the ``scenes`` table scoped to
    the current project. It exposes a single output:

    * **scene_data** — raw scene record for downstream narrative processing.
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
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Scene Data", name="scene_data", method="build"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected scene from the database and return it as structured Data.

        Results are cached per entity name so that repeated calls within
        the same execution avoid a redundant database round-trip.

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
