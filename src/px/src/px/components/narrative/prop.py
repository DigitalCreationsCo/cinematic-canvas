from __future__ import annotations

from portals.schema import Data
from portals.services.database.models.prop.model import Prop

from px.base.models.model import LCModelComponent
from px.components.narrative.base_entity import BaseEntityReadPatchComponent
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

_INPUT_TO_MODEL_FIELD = {
    _PROP_NAME: "name",
    _PROP_TYPE: "type",
    _GUIDANCE_LEVEL: "guidance_level",
}


class PropComponent(BaseEntityReadPatchComponent, LCModelComponent):
    """Display prop details and return the prop record.

    This component reads prop records from the ``props`` table scoped to
    the current project. It exposes a single output:

    * **prop_data** — raw prop record for downstream narrative processing.
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

    # Bind to the specific relational model and storyboard JSON key
    entity_model = Prop
    storyboard_key = "props"

    # ── Instance-level cache ─────────────────────────────────────────────
    # Maps entity_name → prop_dict so that graph executions referencing
    # both outputs for the same prop only hit the database once.
    _prop_cache: dict[str, dict]

    def build_config(self):
        return {
            _SELECTED_ENTITY: {
                "display_name": "Select Prop",
                "options": self.get_entity_options,
                "refresh_button": True,
            },
            _UPDATE_DB: {
                "display_name": "Patch Database?",
                "info": "If true, the prop's record will be updated with the traits/state below.",
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
        BoolInput(name=_UPDATE_DB, display_name="Patch Database?", value=False),
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
        """Read the selected prop from the database and return it as structured Data.

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
                self._prop_cache.pop(selected_entity, None)
                logger.debug(f"Patching prop '{selected_entity}' with {model_updates}")
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
                    logger.error(f"Patch failed for prop '{selected_entity}': {patch_result.data['error']}")
                    return patch_result

        # 3. Read from DB (fresh or cached).
        try:
            prop_dict = self._fetch_prop_data(selected_entity)
        except ValueError as exc:
            logger.error(f"Failed to fetch prop '{selected_entity}': {exc}")
            return Data(data={"error": str(exc)})

        # 4. Overlay input-driven overrides so the output reflects edits.
        prop_dict.update(self._to_model_patch(updated_data))

        return Data(data=prop_dict)

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
