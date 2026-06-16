"""Project Service.

Encapsulates all database operations for Cinematic Canvas projects (Folders),
including batched entity ingestion and storyboard merges.
"""

from typing import Any

from px.components.narrative.storyboard_manager import StoryboardManager
from px.log.logger import logger
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select

from portals.services.base import Service
from portals.services.database.models.character.model import Character
from portals.services.database.models.location.model import Location
from portals.services.database.models.prop.model import Prop


class ProjectService(Service):
    name = "project_service"

    # ── LLM-to-model key mapping ───────────────────────────────────────
    # Some LLMs emit camelCase keys that don't match the SQLModel fields.
    # Map them here so ingestion works without requiring prompt changes.
    _LLM_KEY_MAP: dict[str, str] = {
        "referenceId": "reference_id",
    }

    # ── Public API ─────────────────────────────────────────────────────

    def ingest_storyboard_payload(self, project_id: str, storyboard_payload: dict[str, Any]) -> None:
        """Deduplicate, batch-upsert entities, and merge the storyboard JSON.

        Opens a single session for the entire operation (DRY: no nested
        session scopes).  Commits on success; the caller is responsible
        for logging any top-level exception.
        """
        logger.info("Ingesting storyboard payload for project '%s'.", project_id)

        from portals.services.deps import get_db_service

        db_service = get_db_service()
        with db_service.with_session() as session:
            # 1. Deduplicate
            deduped_characters = self._deduplicate_entities(storyboard_payload.get("characters", []))
            deduped_locations = self._deduplicate_entities(storyboard_payload.get("locations", []))
            deduped_props = self._deduplicate_entities(storyboard_payload.get("props", []))

            # 2. Batch upsert (single session, no nesting)
            self._batch_upsert_entities(session, project_id, Character, deduped_characters)
            self._batch_upsert_entities(session, project_id, Location, deduped_locations)
            self._batch_upsert_entities(session, project_id, Prop, deduped_props)

            # 3. Merge storyboard JSON
            self._merge_project_storyboard(session, project_id, storyboard_payload)

            session.commit()
            logger.info("Ingested storyboard payload for project '%s'.", project_id)

    # ── Internal helpers ───────────────────────────────────────────────

    @staticmethod
    def _deduplicate_entities(
        entities: list[dict[str, Any]],
        unique_key: str = "name",
    ) -> list[dict[str, Any]]:
        """Deduplicate a list of dicts by *unique_key*, favouring the last occurrence."""
        if not entities:
            return []
        seen: dict[str, dict[str, Any]] = {}
        for entity in entities:
            key = entity.get(unique_key)
            if key:
                seen[key] = entity
        logger.debug(
            "Deduplicated %d raw entities to %d by '%s'.",
            len(entities),
            len(seen),
            unique_key,
        )
        return list(seen.values())

    def _batch_upsert_entities(
        self,
        session: Any,
        project_id: str,
        model_class: type,
        entities: list[dict[str, Any]],
    ) -> None:
        """Read-diff-write upsert for *model_class* within an open *session*.

        Every incoming dict is normalised through ``_normalize_entity_dict``
        first so that LLM-generated keys (e.g. ``referenceId``) are mapped
        to SQLModel fields and unknown keys are stripped.
        """
        if not entities:
            return

        model_name = model_class.__name__
        names = [e.get("name") for e in entities if e.get("name")]
        logger.info(
            "Upserting %d %s(s) for project '%s'.",
            len(entities),
            model_name,
            project_id,
        )

        # Batched read of existing records
        stmt = select(model_class).where(
            model_class.project_id == project_id,
            model_class.name.in_(names),
        )
        existing = {r.name: r for r in session.exec(stmt).all()}

        to_add: list = []
        updated = 0

        for raw in entities:
            entity_name = raw.get("name")
            if not entity_name:
                continue

            data = self._normalize_entity_dict(model_class, raw)

            if entity_name in existing:
                record = existing[entity_name]
                for key, value in data.items():
                    if hasattr(record, key) and key not in ("id", "project_id"):
                        setattr(record, key, value)
                updated += 1
            else:
                to_add.append(model_class(**data, project_id=project_id))

        if to_add:
            session.add_all(to_add)

        logger.info(
            "%s upsert complete — created: %d, updated: %d.",
            model_name,
            len(to_add),
            updated,
        )

    def _merge_project_storyboard(
        self,
        session: Any,
        project_id: str,
        generated_payload: dict[str, Any],
    ) -> None:
        """Merge the generated storyboard JSON into ``Folder.storyboard``."""
        from portals.services.database.models.folder.model import Folder

        stmt = select(Folder).where(Folder.id == project_id)
        folder = session.exec(stmt).first()
        if not folder:
            msg = f"Project folder '{project_id}' not found in database."
            raise ValueError(msg)

        merged = StoryboardManager.merge_into_project(
            current_storyboard=folder.storyboard or {},
            generated=generated_payload,
        )
        folder.storyboard = merged
        flag_modified(folder, "storyboard")
        session.add(folder)
        logger.info("Storyboard merged for project '%s'.", project_id)

    # ── Field normalisation ────────────────────────────────────────────

    @staticmethod
    def _normalize_entity_dict(model_class: type, data: dict[str, Any]) -> dict[str, Any]:
        """Map LLM-generated keys to SQLModel fields and strip unknowns.

        * Renames ``referenceId`` → ``reference_id`` (all entity types).
        * Converts ``traits`` (string) → ``physical_traits`` (dict) for Character.
        * Injects ``state`` default ``{"status": "active"}`` when missing.
        * Drops any key not present in ``model_class.model_fields``.
        """
        result = dict(data)

        # Rename known LLM keys
        for old_key, new_key in ProjectService._LLM_KEY_MAP.items():
            if old_key in result:
                result[new_key] = result.pop(old_key)

        # Character-specific: traits -> physical_traits
        if model_class is Character and "traits" in result:
            val = result.pop("traits")
            if isinstance(val, str):
                result["physical_traits"] = {"description": val}
            elif isinstance(val, dict):
                result["physical_traits"] = val

        # Fill required state default
        if "state" not in result and "state" in model_class.model_fields:
            result["state"] = {"status": "active"}

        # Strip unknown keys (prevents SQLModel strict __init__ errors)
        allowed = set(model_class.model_fields.keys())
        return {k: v for k, v in result.items() if k in allowed}
