from typing import Any

from px.log.logger import logger
from px.services.base import Service


class ProjectService(Service):
    """No-operation fallback project service for standalone px usage.

    This is the default implementation used when no real database-backed
    ``ProjectService`` from the ``portals`` backend is available.  Every
    method logs a warning and returns a no-op result so that callers
    (e.g. ``ingest_storyboard_to_database`` in the narrative components)
    do not crash when running in standalone px mode.

    When the ``portals`` backend is wired in, ``px.services.deps.get_project_service()``
    returns the real implementation instead of this one.
    """

    def ingest_storyboard_payload(self, project_id: str, storyboard_payload: dict[str, Any]) -> None:
        """No-op: logs a warning and returns silently."""
        logger.warning(
            "No database ProjectService available — skipping storyboard "
            "ingestion for project '%s'. The payload contains %d characters, "
            "%d locations, and %d props.",
            project_id,
            len(storyboard_payload.get("characters", [])),
            len(storyboard_payload.get("locations", [])),
            len(storyboard_payload.get("props", [])),
        )

    def _batch_upsert_entities(
        self, _session: Any, _project_id: str, model_class: type, entities: list[dict[str, Any]]
    ) -> None:
        """No-op: database unavailable, nothing to upsert."""
        logger.debug(
            "No-op _batch_upsert_entities called for %d %s(s).",
            len(entities),
            model_class.__name__,
        )

    def _merge_project_storyboard(self, _session: Any, project_id: str, _generated_payload: dict[str, Any]) -> None:
        """No-op: database unavailable, nothing to merge."""
        logger.debug(
            "No-op _merge_project_storyboard called for project '%s'.",
            project_id,
        )

    def _deduplicate_entities(self, entities: list[dict[str, Any]], unique_key: str = "name") -> list[dict[str, Any]]:
        """Deduplicates a list of dictionaries based on a unique key, favoring the last occurrence.

        Provided as a default utility but can be overridden if custom matching logic is required.
        """
        if not entities:
            return []
        deduplicated_map = {entity.get(unique_key): entity for entity in entities if entity.get(unique_key)}
        return list(deduplicated_map.values())
