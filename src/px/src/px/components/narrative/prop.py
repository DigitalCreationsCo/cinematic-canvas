from __future__ import annotations

from portals.schema import Data

from px.base.models.model import LCModelComponent
from px.components.narrative.base_state_aware import BaseStateAwareComponent
from px.field_typing.range_spec import RangeSpec
from px.io import (
    BoolInput,
    DropdownInput,
    Output,
    SliderInput,
    StrInput,
)
from px.log.logger import logger

# ── Field name constants ─────────────────────────────────────────────

_SELECTED_ENTITY = "selected_entity"
_UPDATE_DB = "update_database"
_PROP_NAME = "prop_name"
_PROP_TYPE = "prop_type"
_GUIDANCE_LEVEL = "guidance_level"

_PROFILE_FIELDS = (
    _PROP_NAME,
    _PROP_TYPE,
    _GUIDANCE_LEVEL,
)

_INPUT_TO_MANIFEST_FIELD = {
    _PROP_NAME: "name",
    _PROP_TYPE: "type",
    _GUIDANCE_LEVEL: "guidance_level",
}


class PropComponent(BaseStateAwareComponent, LCModelComponent):
    """Display prop details and return the prop record.

    This component reads prop manifests from the NAP universe
    scoped to the current project. It exposes a single output:

    * **prop_data** — raw prop manifest for downstream narrative processing.
    """

    # Override LCModelComponent._validate_outputs since our output names
    # are prop-specific (prop_data) rather than
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

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → prop manifest
    _prop_cache: dict[str, dict]

    def build_config(self):
        return {
            _SELECTED_ENTITY: {
                "display_name": "Select Prop",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch NAP Manifest?",
                "info": (
                    "If true, the prop's manifest will be updated. "
                    "In Gen3 architecture, writes go through the NAP persistence pipeline."
                ),
                "advanced": False,
            },
            _PROP_NAME: {
                "display_name": "Name",
                "info": "Prop's display name.",
            },
            _PROP_TYPE: {
                "display_name": "Type",
                "info": "Category or type of prop (e.g. weapon, tool, clothing).",
            },
            _GUIDANCE_LEVEL: {
                "display_name": "Guidance Level",
                "info": "Controls how closely the model should follow the prop profile.",
            },
        }

    # ── Input ports ──────────────────────────────────────────────────────

    _profile_inputs = [
        StrInput(
            name=_PROP_NAME,
            display_name="Name",
            info="Prop's display name.",
            value="",
        ),
        StrInput(
            name=_PROP_TYPE,
            display_name="Type",
            info="Category or type of prop (e.g. weapon, tool, clothing).",
            value="",
        ),
        SliderInput(
            name=_GUIDANCE_LEVEL,
            display_name="Guidance Level",
            info="Controls how closely the model should follow the prop profile.",
            value=5,
            range_spec=RangeSpec(min=0, max=10, step=1),
            advanced=True,
        ),
    ]

    inputs = [
        DropdownInput(name=_SELECTED_ENTITY, display_name="Select Prop"),
        BoolInput(name=_UPDATE_DB, display_name="Patch NAP Manifest?", value=False),
        *_profile_inputs,
    ]

    # ── Output ports ─────────────────────────────────────────────────────

    outputs = [
        Output(display_name="Prop Data", name="prop_data", method="build"),
    ]

    # ═══════════════════════════════════════════════════════════════════════
    # OUTPUT METHODS
    # ═══════════════════════════════════════════════════════════════════════

    def build(self, selected_entity: str, *, update_database: bool = False) -> Data:
        """Read the selected prop from the NAP universe and return it as structured Data.

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
                self._prop_cache.pop(selected_entity, None)
                logger.info(
                    "Prop update requested — forwarding to NAP persistence pipeline. "
                    "Updates must go through the NAP API (POST /nap/publish). "
                    f"Entity='{selected_entity}', updates={model_updates}"
                )

        # 3. Read from NAP universe (fresh or cached).
        try:
            prop_manifest = self._fetch_prop_data(selected_entity)
        except ValueError as exc:
            logger.error(f"Failed to fetch prop '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

        # 4. Overlay input-driven overrides so the output reflects edits.
        prop_manifest.update(self._to_manifest_patch(updated_data))

        return Data(data=prop_manifest)

    # ═══════════════════════════════════════════════════════════════════════
    # INTERNAL HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def get_entity_options(self) -> list[str]:
        """Dynamically fetch prop names from the NAP universe."""
        try:
            props = self.get_entities("prop")
            if not props:
                return ["No props found in universe"]
            names = [p.get("name", p.get("id", "(unnamed)")) for p in props]
            return sorted(names)
        except Exception as exc:
            logger.warning(f"Failed to fetch prop options: {exc}")
            return ["No props found"]

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
        """Translate input-name keys to manifest field keys."""
        patch: dict[str, object] = {}
        for input_name, value in input_overrides.items():
            manifest_field = _INPUT_TO_MANIFEST_FIELD.get(input_name)
            if manifest_field:
                patch[manifest_field] = value
        return patch

    def _fetch_prop_data(self, entity_name: str) -> dict:
        """Fetch prop data from the NAP universe with instance-level caching."""
        if not hasattr(self, "_prop_cache") or self._prop_cache is None:
            self._prop_cache = {}

        cached = self._prop_cache.get(entity_name)
        if cached is not None:
            logger.debug("Cache hit for prop '%s'.", entity_name)
            return cached

        logger.debug("Cache miss for prop '%s' — reading from NAP.", entity_name)

        try:
            props = self.get_entities("prop")
        except Exception as exc:
            msg = f"Failed to list props from NAP universe: {exc}"
            raise ValueError(msg) from exc

        # Match by name
        match = None
        for p in props:
            if p.get("name") == entity_name:
                match = p
                break

        if match is None:
            msg = f"Prop '{entity_name}' not found in NAP universe."
            raise ValueError(msg)

        self._prop_cache[entity_name] = match
        return match
