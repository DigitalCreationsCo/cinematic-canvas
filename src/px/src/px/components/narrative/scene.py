from __future__ import annotations

from portals.schema import Data
from portals.services.database.models.scene.model import Scene

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
_SCENE_NAME = "scene_name"
_SCENE_TYPE = "scene_type"
_MOOD = "mood"
_SHOT_TYPE = "shot_type"
_CAMERA_ANGLE = "camera_angle"
_CAMERA_MOVEMENT = "camera_movement"
_COMPOSITION = "composition"
_LIGHTING = "lighting"
_CONTINUITY_NOTES = "continuity_notes"
_GUIDANCE_LEVEL = "guidance_level"

_PROFILE_FIELDS = (
    _SCENE_NAME,
    _SCENE_TYPE,
    _MOOD,
    _SHOT_TYPE,
    _CAMERA_ANGLE,
    _CAMERA_MOVEMENT,
    _COMPOSITION,
    _LIGHTING,
    _CONTINUITY_NOTES,
    _GUIDANCE_LEVEL,
)

_INPUT_TO_MODEL_FIELD = {
    _SCENE_NAME: "name",
    _SCENE_TYPE: "type",
    _MOOD: "mood",
    _SHOT_TYPE: "shot_type",
    _CAMERA_ANGLE: "camera_angle",
    _CAMERA_MOVEMENT: "camera_movement",
    _COMPOSITION: "composition",
    _LIGHTING: "lighting",
    _CONTINUITY_NOTES: "continuity_notes",
    _GUIDANCE_LEVEL: "guidance_level",
}


class SceneComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display scene details and return the scene record.

    This component reads scene records from the ``scenes`` table scoped to
    the current project. It exposes a single output:

    * **scene_data** — raw scene record for downstream narrative processing.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are scene-specific (scene_data) rather than
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
            _SELECTED_ENTITY: {
                "display_name": "Select Scene",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch Database?",
                "info": "If true, the scene's record will be updated with the traits below.",
                "advanced": False,
            },
            _SCENE_NAME: {
                "display_name": "Name",
                "info": "Scene's display name.",
            },
            _SCENE_TYPE: {
                "display_name": "Type",
                "info": "Category of scene (e.g. dialogue, action, montage).",
            },
            _MOOD: {
                "display_name": "Mood",
                "info": "Atmosphere or emotional tone of the scene.",
            },
            _SHOT_TYPE: {
                "display_name": "Shot Type",
                "info": "Type of camera shot (e.g. close-up, wide, medium).",
            },
            _CAMERA_ANGLE: {
                "display_name": "Camera Angle",
                "info": "Angle of the camera (e.g. low, high, eye-level).",
            },
            _CAMERA_MOVEMENT: {
                "display_name": "Camera Movement",
                "info": "Camera movement description (e.g. pan, tilt, dolly).",
            },
            _COMPOSITION: {
                "display_name": "Composition",
                "info": "Frame composition as a JSON object.",
            },
            _LIGHTING: {
                "display_name": "Lighting",
                "info": "Lighting setup as a JSON object.",
            },
            _CONTINUITY_NOTES: {
                "display_name": "Continuity Notes",
                "info": "Notes on continuity between scenes.",
            },
            _GUIDANCE_LEVEL: {
                "display_name": "Guidance Level",
                "info": "Controls how closely the model should follow the scene profile.",
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    _profile_inputs = [
        StrInput(
            name=_SCENE_NAME,
            display_name="Name",
            info="Scene's display name.",
            value="",
        ),
        StrInput(
            name=_SCENE_TYPE,
            display_name="Type",
            info="Category of scene (e.g. dialogue, action, montage).",
            value="",
        ),
        StrInput(
            name=_MOOD,
            display_name="Mood",
            info="Atmosphere or emotional tone of the scene.",
            value="",
        ),
        StrInput(
            name=_SHOT_TYPE,
            display_name="Shot Type",
            info="Type of camera shot (e.g. close-up, wide, medium).",
            value="",
            advanced=True,
        ),
        StrInput(
            name=_CAMERA_ANGLE,
            display_name="Camera Angle",
            info="Angle of the camera (e.g. low, high, eye-level).",
            value="",
            advanced=True,
        ),
        StrInput(
            name=_CAMERA_MOVEMENT,
            display_name="Camera Movement",
            info="Camera movement description (e.g. pan, tilt, dolly).",
            value="",
            advanced=True,
        ),
        DictInput(
            name=_COMPOSITION,
            display_name="Composition",
            info="Frame composition as a JSON object.",
            advanced=True,
        ),
        DictInput(
            name=_LIGHTING,
            display_name="Lighting",
            info="Lighting setup as a JSON object.",
            advanced=True,
        ),
        StrInput(
            name=_CONTINUITY_NOTES,
            display_name="Continuity Notes",
            info="Notes on continuity between scenes.",
            value="",
            advanced=True,
        ),
        SliderInput(
            name=_GUIDANCE_LEVEL,
            display_name="Guidance Level",
            info="Controls how closely the model should follow the scene profile.",
            value=5,
            range_spec=RangeSpec(min=0, max=10, step=1),
            advanced=True,
        ),
    ]

    inputs = [
        DropdownInput(name=_SELECTED_ENTITY, display_name="Select Scene"),
        BoolInput(name=_UPDATE_DB, display_name="Patch Database?", value=False),
        *_profile_inputs,
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

        When ``update_database`` is ``True`` the profile fields are patched
        to the database before reading.
        """
        # 1. Collect any profile-field overrides supplied via inputs.
        updated_data = self._collect_profile_overrides()

        # 2. When the caller signals a database mutation, perform the patch.
        if update_database:
            model_updates = self._to_model_patch(updated_data)
            if model_updates:
                self._scene_cache.pop(selected_entity, None)
                logger.debug(f"Patching scene '{selected_entity}' with {model_updates}")
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
                    logger.error(f"Patch failed for scene '{selected_entity}': {patch_result.data['error']}")
                    return patch_result

        # 3. Read from DB (fresh or cached).
        try:
            scene_dict = self._fetch_scene_data(selected_entity)
        except ValueError as exc:
            logger.error(f"Failed to fetch scene '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

        # 4. Overlay input-driven overrides so the output reflects edits.
        scene_dict.update(self._to_model_patch(updated_data))

        return Data(data=scene_dict)

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
        """Translate input-name keys to model-field keys.

        Fields that arrive as a comma-separated string (e.g. ``continuity_notes``)
        are automatically converted to ``list[str]``.
        """
        _string_to_list = frozenset({"continuity_notes"})

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

    def _fetch_scene_data(self, entity_name: str) -> dict:
        """Fetch scene data from the database with instance-level caching.

        Results are cached per entity name within a single component execution
        so that ``build()`` shares the same database record without a redundant read.
        """
        # Lazy-init the cache so subclasses or direct __new__ usage doesn't break.
        if not hasattr(self, "_scene_cache") or self._scene_cache is None:
            self._scene_cache = {}

        # Return cached data when available.
        cached = self._scene_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for scene '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for scene '%s' — reading from database.", entity_name)

        # Read from DB via the shared base-entity logic.
        result = self._execute_read_patch_logic(
            entity_name,
            update_database=False,
            updated_data={},
        )

        # Surface DB-level errors (e.g. scene not found).
        if isinstance(result, Data) and isinstance(result.data, dict) and "error" in result.data:
            msg = str(result.data["error"])
            raise ValueError(msg)

        # Cache and return the raw dictionary.
        scene_dict: dict = result.data if isinstance(result.data, dict) else {}
        self._scene_cache[entity_name] = scene_dict
        return scene_dict
