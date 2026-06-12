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
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Scene Data", name="scene_data", method="build"),
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
