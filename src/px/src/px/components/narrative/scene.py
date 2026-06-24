from __future__ import annotations

from portals.schema import Data

from px.base.models.model import LCModelComponent
from px.components.narrative.base_state_aware import BaseStateAwareComponent
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

_INPUT_TO_MANIFEST_FIELD = {
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


class SceneComponent(BaseStateAwareComponent, LCModelComponent):
    """Display scene details and return the scene record.

    This component reads scene manifests from the NAP universe
    scoped to the current project. It exposes a single output:

    * **scene_data** — raw scene manifest for downstream narrative processing.
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

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → scene manifest
    _scene_cache: dict[str, dict]

    def build_config(self):
        return {
            _SELECTED_ENTITY: {
                "display_name": "Select Scene",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch NAP Manifest?",
                "info": (
                    "If true, the scene's manifest will be updated. "
                    "In Gen3 architecture, writes go through the NAP persistence pipeline."
                ),
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
        BoolInput(name=_UPDATE_DB, display_name="Patch NAP Manifest?", value=False),
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
        """Read the selected scene from the NAP universe and return it as structured Data.

        Results are cached per entity name so that repeated calls within
        the same execution avoid a redundant NAP resolution.

        When ``update_database`` is ``True`` the profile fields are noted
        (in Gen3 architecture, writes go through the NAP persistence pipeline).
        """
        # 1. Collect any profile-field overrides supplied via inputs.
        updated_data = self._collect_profile_overrides()

        # 2. When the caller signals a mutation, log (nap persistence pipeline handles writes).
        if update_database:
            model_updates = self._to_manifest_patch(updated_data)
            if model_updates:
                self._scene_cache.pop(selected_entity, None)
                logger.info(
                    "Scene update requested — forwarding to NAP persistence pipeline. "
                    "Updates must go through the NAP API (POST /nap/publish). "
                    f"Entity='{selected_entity}', updates={model_updates}"
                )

        # 3. Read from NAP universe (fresh or cached).
        try:
            scene_manifest = self._fetch_scene_data(selected_entity)
        except ValueError as exc:
            logger.error(f"Failed to fetch scene '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

        # 4. Overlay input-driven overrides so the output reflects edits.
        scene_manifest.update(self._to_manifest_patch(updated_data))

        return Data(data=scene_manifest)

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def get_entity_options(self) -> list[str]:
        """Dynamically fetch scene names from the NAP universe."""
        try:
            scenes = self.get_entities("scene")
            if not scenes:
                return ["No scenes found in universe"]
            names = [s.get("name", s.get("id", "(unnamed)")) for s in scenes]
            return sorted(names)
        except Exception as exc:
            logger.warning(f"Failed to fetch scene options: {exc}")
            return ["No scenes found"]

    def _collect_profile_overrides(self) -> dict[str, object]:
        """Gather non-empty profile-field values from the component's input ports."""
        overrides: dict[str, object] = {}
        for field_name in _PROFILE_FIELDS:
            value = getattr(self, field_name, None)
            if value is not None and value != "":
                overrides[field_name] = value
        return overrides

    @staticmethod
    def _to_manifest_patch(input_overrides: dict[str, object]) -> dict[str, object]:
        """Translate input-name keys to manifest field keys.

        Fields that arrive as a comma-separated string (e.g. ``continuity_notes``)
        are automatically converted to ``list[str]``.
        """
        _string_to_list = frozenset({"continuity_notes"})

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

    def _fetch_scene_data(self, entity_name: str) -> dict:
        """Fetch scene data from the NAP universe with instance-level caching."""
        if not hasattr(self, "_scene_cache") or self._scene_cache is None:
            self._scene_cache = {}

        cached = self._scene_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for scene '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for scene '%s' — reading from NAP.", entity_name)

        try:
            scenes = self.get_entities("scene")
        except Exception as exc:
            msg = f"Failed to list scenes from NAP universe: {exc}"
            raise ValueError(msg) from exc

        # Match by name
        match = None
        for s in scenes:
            if s.get("name") == entity_name:
                match = s
                break

        if match is None:
            msg = f"Scene '{entity_name}' not found in NAP universe."
            raise ValueError(msg)

        self._scene_cache[entity_name] = match
        return match
