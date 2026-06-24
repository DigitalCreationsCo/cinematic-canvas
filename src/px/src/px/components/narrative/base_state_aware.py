"""Base class providing project (Folder) and NAP state awareness.

Gen3 Architecture
-----------------
This component is the foundational superclass for all narrative components.
It provides:

* **Project metadata** (Folder) — still backed by the Portals database.
  Folders are application-level objects that hold project title,
  description, settings, workflow state, and generation state.
* **Narrative state** (NAP) — all entity reads flow through ``NapService``,
  which wraps ``nap_sdk``.  No SQL or ORM is used for narrative entities.

The separation is intentional:

    Folder != Universe

    Folder  = project metadata (title, settings, workflow)
    Universe = narrative entities (characters, locations, props, groups, scenes, world)

Usage
-----
    class MyComponent(BaseStateAwareComponent, SomeOtherBase):

        def build_something(self):
            folder = self.get_folder()
            title = self.get_project_title()
            world = self.get_world()
            characters = self.get_entities("character")
            entity = self.get_entity("nap://project/character/abc")
"""

from __future__ import annotations

from typing import Any

from px.custom.custom_component.custom_component import CustomComponent
from px.log.logger import logger

# ---------------------------------------------------------------------------
# NapService accessor (lazy import to keep standalone px importable)
# ---------------------------------------------------------------------------


def _get_nap_service():
    """Lazy import and return the global NapService.

    If the service has not been explicitly initialised, attempts a
    settings-backed auto-initialisation so that development and simple
    deployments work out of the box.  If auto-init fails the caller
    receives a clear ``NapError``.
    """
    from px.services.nap_service import NapError, get_nap_read_service, initialize_nap_read_service

    service = get_nap_read_service()
    if service is not None:
        return service

    # Lazy init from settings (silently best-effort)
    try:
        from pathlib import Path

        from px.services.deps import get_settings_service

        settings = get_settings_service().settings
        base_path = getattr(settings, "nap_storage_dir", None) or str(Path.home() / ".nap")
        initialize_nap_read_service(universe="default", base_path=base_path)
        service = get_nap_read_service()
    except Exception:
        pass

    if service is None:
        raise NapError(
            "NapService is not initialised. Ensure a universe is configured "
            "and initialize_nap_read_service() has been called."
        )
    return service


# ===========================================================================
# BaseStateAwareComponent
# ===========================================================================


class BaseStateAwareComponent(CustomComponent):
    """Foundational superclass for Gen3 narrative components.

    Provides read access to:

    * **Folder** (project metadata) — via ``get_folder()``.
      Folders remain in the Portals database; they are application-level
      objects, not narrative databases.
    * **NAP universe** (narrative state) — via NapService methods.

    Subclasses should never directly import ``nap_sdk`` or SQL models.
    All entity access flows through the methods below.
    """

    # ------------------------------------------------------------------
    # Folder (project metadata)
    # ------------------------------------------------------------------

    def get_folder(self) -> Any:
        """Fetch the ``Folder`` record for the currently executing flow.

        The Folder is an application-level object that contains project
        metadata (title, description, settings, workflow state, generation
        state).  It is **not** a narrative database — narrative entities
        live in the NAP universe.

        Returns:
            A Folder instance (with ``.id``, ``.metadata_``, etc.).

        Raises:
            ValueError: If no flow context is active or no matching Folder
            is found.
        """
        from portals.services.database.models.folder.model import Folder
        from sqlmodel import select

        from px.services.deps import get_db_service

        flow_id = self._get_flow_id()
        db_service = get_db_service()
        with db_service.with_session() as session:
            statement = select(Folder).where(Folder.flows.any(id=flow_id))
            project = session.exec(statement).first()
            if not project:
                raise ValueError("Could not locate the project state for this flow.")

        # Ensure NapService is initialised with this project's universe
        self._ensure_nap_for_project(project)
        return project

    def _ensure_nap_for_project(self, folder: Any) -> None:
        """Initialise NapService with the project's NAP universe if needed.

        Uses ``folder.id`` as the universe name and the configured NAP
        storage directory as the base path.  If the service is already
        pointing at this universe this is a no-op.
        """
        from px.services.nap_service import get_nap_read_service, initialize_nap_read_service

        service = get_nap_read_service()
        if service is not None and service.universe == str(folder.id):
            return  # Already pointing at the right universe

        from pathlib import Path

        from px.services.deps import get_settings_service

        settings = get_settings_service().settings
        base_path = getattr(settings, "nap_storage_dir", None) or str(Path.home() / ".nap")
        initialize_nap_read_service(universe=str(folder.id), base_path=base_path)

    def get_project_title(self) -> str:
        """Resolve the project title from the Folder metadata.

        Falls back to the component's ``title`` input if no project
        context is available.

        Returns:
            The effective project title string.
        """
        try:
            folder = self.get_folder()
            raw_meta = getattr(folder, "metadata_", None) or {}
            project_metadata = raw_meta if isinstance(raw_meta, dict) else {}
            return project_metadata.get("title", "") or ""
        except Exception:  # noqa: BLE001
            # Fall back to component input
            return getattr(self, "title", "") or ""

    # ------------------------------------------------------------------
    # NAP universe access
    # ------------------------------------------------------------------

    def get_universe(self) -> str:
        """Return the configured NAP universe name.

        Raises:
            NapError: If NapService is not initialised.
        """
        service = _get_nap_service()
        return service.get_universe_name()

    def get_world(self) -> dict[str, Any]:
        """Get the world manifest from the current NAP universe.

        Returns:
            World entity manifest dict.

        Raises:
            EntityNotFoundError: If no world entity exists.
        """
        service = _get_nap_service()
        return service.get_world_manifest()

    def get_entity(self, uri: str) -> dict[str, Any]:
        """Resolve a single narrative entity by NAP URI.

        Args:
            uri: Fully qualified NAP URI
                 (e.g. ``nap://my-project/character/hagrid``).

        Returns:
            Normalised entity manifest dict.

        Raises:
            InvalidUriError: If the URI is malformed.
            EntityNotFoundError: If the entity does not exist.
        """
        service = _get_nap_service()
        return service.get_entity(uri)

    def get_entities(self, entity_type: str) -> list[dict[str, Any]]:
        """List all entities of a given type in the current universe.

        Args:
            entity_type: e.g. ``"character"``, ``"location"``, ``"prop"``,
                        ``"group"``, ``"scene"``.

        Returns:
            List of normalised entity manifests.
        """
        service = _get_nap_service()
        return service.get_entities(entity_type)

    def get_representation(
        self,
        uri: str,
        representation_key: str,
    ) -> dict[str, Any] | None:
        """Get a representation from an entity manifest.

        Args:
            uri: NAP URI of the entity.
            representation_key: e.g. ``"portrait"``, ``"avatar"``, ``"sheet"``.

        Returns:
            Representation dict or ``None``.
        """
        service = _get_nap_service()
        return service.get_representation(uri, representation_key)

    def resolve_many(self, uris: list[str]) -> list[dict[str, Any]]:
        """Resolve multiple entities in batch.

        Args:
            uris: List of NAP URIs.

        Returns:
            List of resolved manifests (unresolvable URIs omitted).
        """
        service = _get_nap_service()
        return service.resolve_many(uris)

    def query(self, uri: str, path: str) -> Any:
        """Query a sub-path within an entity manifest.

        Args:
            uri: NAP URI to query.
            path: Dot-separated path (e.g. ``"references.members"``).

        Returns:
            Value at the path, or ``None``.
        """
        service = _get_nap_service()
        return service.query(uri, path)

    def entity_exists(self, uri: str) -> bool:
        """Check if an entity exists in the NAP universe.

        Args:
            uri: NAP URI to check.

        Returns:
            ``True`` if resolvable, ``False`` otherwise.
        """
        service = _get_nap_service()
        return service.entity_exists(uri)

    def get_entity_references(self, uri: str) -> dict[str, Any]:
        """Get the references section of an entity manifest.

        Args:
            uri: NAP URI of the entity.

        Returns:
            References dict or empty dict.
        """
        service = _get_nap_service()
        return service.get_entity_references(uri)

    def build_story_context(
        self,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        """Build a bounded story context for prompt generation.

        Loads world, characters, locations, props, groups, and scenes
        into a single dict.  Only top-level entity lists are loaded —
        the full universe is **not** traversed.

        Args:
            project_id: Optional project ID for future scoping.

        Returns:
            Dict with keys: ``world``, ``characters``, ``locations``,
            ``props``, ``groups``, ``scenes``.
        """
        service = _get_nap_service()
        return service.get_project_story_context(project_id)

    # ------------------------------------------------------------------
    # Legacy convenience methods (retained for backward compatibility)
    # These now delegate to NapService instead of SQL.
    # ------------------------------------------------------------------

    def get_all_existing_entities(self, project_id: str) -> dict[str, list[dict[str, Any]]]:
        """Convenience — returns all narrative entities in one dict.

        .. note::
            The *project_id* parameter is accepted for backward compatibility
            but ignored — entities are scoped by the NAP universe, not by
            project folder.

        Returns:
            Dict with keys ``characters``, ``locations``, ``props``.
        """
        _ = project_id  # Backward compat — entities come from universe
        service = _get_nap_service()
        return {
            "characters": service.get_entities("character"),
            "locations": service.get_entities("location"),
            "props": service.get_entities("prop"),
        }

    # ------------------------------------------------------------------
    # Storyboard persistence
    # ------------------------------------------------------------------

    def ingest_storyboard_to_database(self, project_id: str, storyboard_payload: dict) -> None:
        """Persist a generated storyboard to the project folder.

        Delegates to ProjectService which handles the Folder storyboard
        field update.
        """
        from px.services.deps import get_project_service

        project_service = get_project_service()
        project_service.ingest_storyboard_payload(project_id, storyboard_payload)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_flow_id(self) -> str:
        """Extract the current flow ID from the graph context.

        Raises:
            ValueError: If no flow context is active.
        """
        flow_id = self.graph.flow_id if self.graph else None
        if not flow_id:
            raise ValueError(
                "Execution error: No active flow context found. "
                "Ensure this component is running inside a Langflow flow."
            )
        return flow_id


