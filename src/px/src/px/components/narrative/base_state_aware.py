"""Base class providing project (Folder) and injected NAP state awareness.

Gen3 Architecture (Stateless Payload Injection)
-----------------------------------------------
This component acts as the foundational superclass for all narrative components
in the Portals ecosystem.

* **Project metadata** (Folder) — backed by the Portals database.
* **Narrative state** (NAP) — strictly read from an in-memory payload injected
  by the frontend into the execution context. No local filesystem or remote
  VCS server reads occur during node execution.
"""

from __future__ import annotations

import logging
from typing import Any

from px.custom.custom_component.custom_component import CustomComponent

logger = logging.getLogger(__name__)


class NapContextError(Exception):
    """Raised when the injected NAP state is missing or malformed."""


class InjectedNapContext:
    """In-memory wrapper for frontend-injected NAP payload."""

    def __init__(self, payload: dict[str, Any]):
        self._payload = payload
        self.universe_name = payload.get("universe", "unknown")

        # Pre-index entities for O(1) resolution
        self._entities_by_uri: dict[str, dict[str, Any]] = {
            entity.get("uri"): entity for entity in payload.get("entities", []) if "uri" in entity
        }

        # Group by type for fast collection retrieval
        self._entities_by_type: dict[str, list[dict[str, Any]]] = {}
        for entity in payload.get("entities", []):
            e_type = entity.get("type")
            if e_type:
                self._entities_by_type.setdefault(e_type, []).append(entity)

    def get_world_manifest(self) -> dict[str, Any]:
        world_entities = self._entities_by_type.get("world", [])
        if not world_entities:
            raise NapContextError("World manifest not found in injected payload.")
        return world_entities[0]

    def get_entity(self, uri: str) -> dict[str, Any]:
        if uri not in self._entities_by_uri:
            raise NapContextError(f"Entity not found in injected payload: {uri}")
        return self._entities_by_uri[uri]

    def get_entities(self, entity_type: str) -> list[dict[str, Any]]:
        return self._entities_by_type.get(entity_type, [])

    def entity_exists(self, uri: str) -> bool:
        return uri in self._entities_by_uri


class BaseStateAwareComponent(CustomComponent):
    """Foundational superclass for Gen3 narrative components.

    Expects the runtime graph context to contain a `nap_payload` dictionary
    injected by the Portals frontend.
    """

    def _get_flow_id(self) -> str:
        """Extract the current flow ID from the graph context."""
        flow_id = self.graph.flow_id if self.graph else None
        if not flow_id:
            raise ValueError(
                "Execution error: No active flow context found. Ensure this component is running inside a valid flow."
            )
        return flow_id

    def _get_nap_context(self) -> InjectedNapContext:
        """Retrieve and wrap the injected NAP payload from the execution state."""
        # Assuming Langflow/graph state dictionary exposes flow_state or custom context
        # Adjust `flow_state` to match your exact dependency injection boundary.
        if not self.graph or not hasattr(self.graph, "flow_state"):
            raise RuntimeError("Graph context does not support state injection.")

        payload = self.graph.flow_state.get("nap_payload")
        if not payload:
            logger.error("nap_payload missing from flow_state.")
            raise NapContextError(
                "NAP payload was not injected into the execution context. "
                "The frontend must attach the required narrative entities to the request."
            )
        return InjectedNapContext(payload)

    # ------------------------------------------------------------------
    # Folder (project metadata) - Retained Database Access
    # ------------------------------------------------------------------

    def get_folder(self) -> Any:
        from portals.services.database.models.folder.model import Folder
        from sqlmodel import select

        from px.services.deps import get_db_service

        flow_id = self._get_flow_id()
        db_service = get_db_service()
        with db_service.with_session() as session:
            statement = select(Folder).where(Folder.flows.any(id=flow_id))
            project = session.exec(statement).first()
            if not project:
                raise ValueError(f"Could not locate project state for flow_id: {flow_id}")

        return project

    def get_project_title(self) -> str:
        try:
            folder = self.get_folder()
            raw_meta = getattr(folder, "metadata_", None) or {}
            project_metadata = raw_meta if isinstance(raw_meta, dict) else {}
            return project_metadata.get("title", "") or ""
        except Exception as e:
            logger.debug(f"Failed to resolve project title from DB, falling back. Cause: {e}")
            return getattr(self, "title", "") or ""

    # ------------------------------------------------------------------
    # NAP universe access - Delegated to Injected Memory Context
    # ------------------------------------------------------------------

    def get_universe(self) -> str:
        return self._get_nap_context().universe_name

    def get_world(self) -> dict[str, Any]:
        return self._get_nap_context().get_world_manifest()

    def get_entity(self, uri: str) -> dict[str, Any]:
        return self._get_nap_context().get_entity(uri)

    def get_entities(self, entity_type: str) -> list[dict[str, Any]]:
        return self._get_nap_context().get_entities(entity_type)

    def entity_exists(self, uri: str) -> bool:
        return self._get_nap_context().entity_exists(uri)

    def get_representation(self, uri: str, representation_key: str) -> dict[str, Any] | None:
        entity = self.get_entity(uri)
        return entity.get("representations", {}).get(representation_key)

    def resolve_many(self, uris: list[str]) -> list[dict[str, Any]]:
        context = self._get_nap_context()
        resolved = []
        for uri in uris:
            try:
                resolved.append(context.get_entity(uri))
            except NapContextError:
                logger.warning(f"Could not resolve batched entity: {uri}")
        return resolved

    def query(self, uri: str, path: str) -> Any:
        """Query a sub-path within an entity manifest using dot notation."""
        entity = self.get_entity(uri)
        keys = path.split(".")
        current = entity
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current

    def get_entity_references(self, uri: str) -> dict[str, Any]:
        entity = self.get_entity(uri)
        return entity.get("references", {})

    def build_story_context(self, project_id: str | None = None) -> dict[str, Any]:
        ctx = self._get_nap_context()
        return {
            "world": ctx.get_world_manifest(),
            "characters": ctx.get_entities("character"),
            "locations": ctx.get_entities("location"),
            "props": ctx.get_entities("prop"),
            "groups": ctx.get_entities("group"),
            "scenes": ctx.get_entities("scene"),
        }

    # ------------------------------------------------------------------
    # Legacy convenience methods
    # ------------------------------------------------------------------

    def get_all_existing_entities(self, project_id: str) -> dict[str, list[dict[str, Any]]]:
        ctx = self._get_nap_context()
        return {
            "characters": ctx.get_entities("character"),
            "locations": ctx.get_entities("location"),
            "props": ctx.get_entities("prop"),
        }

    def ingest_storyboard_to_database(self, project_id: str, storyboard_payload: dict) -> None:
        from px.services.deps import get_project_service

        project_service = get_project_service()
        project_service.ingest_storyboard_payload(project_id, storyboard_payload)
