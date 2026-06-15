"""Base class providing project (Folder) state awareness for Langflow components.

Usage
-----
    class MyComponent(BaseStateAwareComponent, SomeOtherBase):

        def build_something(self):
            project = self.get_fresh_project_state()
            entities = self.get_all_existing_entities(str(project.id))
            ...
"""

from __future__ import annotations

from typing import Any

from px.custom.custom_component.custom_component import CustomComponent


class BaseStateAwareComponent(CustomComponent):
    """Invisible engine that fetches live project state from the database.

    Subclasses call ``get_fresh_project_state()`` to retrieve the current
    ``Folder`` record linked to the executing flow, and…
    ``get_existing_{characters,locations,props}(project_id)`` to fetch
    associated entities from the relational tables.

    All database access is abstracted so subclasses can focus on business
    logic without managing sessions.
    """

    # ------------------------------------------------------------------
    # Core: project (Folder)
    # ------------------------------------------------------------------

    def get_fresh_project_state(self) -> Any:
        """Fetch the ``Folder`` record for the currently executing flow.

        Returns:
            A ``Folder`` SQLModel instance (with ``.id``, ``.storyboard``,
            ``.metadata_``, ``.flows`` etc.).

        Raises:
            ValueError: If no flow context is active or no matching Folder
            is found.
        """
        # Lazy imports so this file can be imported without the full
        # ``portals`` backend installed (important for standalone px tests).
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
            return project

    # ------------------------------------------------------------------
    # Entity queries
    # ------------------------------------------------------------------

    def get_existing_characters(self, project_id: str) -> list[dict[str, Any]]:
        """Fetch all characters for a project from the relational DB.

        Returns a ``list[dict]`` serialised via ``model_dump(mode="json")``.
        """
        from portals.services.database.models.character.model import Character
        from sqlmodel import select

        from px.services.deps import get_db_service

        db_service = get_db_service()
        with db_service.with_session() as session:
            stmt = select(Character).where(Character.project_id == project_id)
            return [c.model_dump(mode="json") for c in session.exec(stmt).all()]

    def get_existing_locations(self, project_id: str) -> list[dict[str, Any]]:
        """Fetch all locations for a project from the relational DB."""
        from portals.services.database.models.location.model import Location
        from sqlmodel import select

        from px.services.deps import get_db_service

        db_service = get_db_service()
        with db_service.with_session() as session:
            stmt = select(Location).where(Location.project_id == project_id)
            return [l.model_dump(mode="json") for l in session.exec(stmt).all()]

    def get_existing_props(self, project_id: str) -> list[dict[str, Any]]:
        """Fetch all props for a project from the relational DB."""
        from portals.services.database.models.prop.model import Prop
        from sqlmodel import select

        from px.services.deps import get_db_service

        db_service = get_db_service()
        with db_service.with_session() as session:
            stmt = select(Prop).where(Prop.project_id == project_id)
            return [p.model_dump(mode="json") for p in session.exec(stmt).all()]

    # ------------------------------------------------------------------
    # Convenience
    # ------------------------------------------------------------------

    def get_all_existing_entities(self, project_id: str) -> dict[str, list[dict[str, Any]]]:
        """Convenience — returns characters, locations, and props in one dict."""
        return {
            "characters": self.get_existing_characters(project_id),
            "locations": self.get_existing_locations(project_id),
            "props": self.get_existing_props(project_id),
        }

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

    def ingest_storyboard_to_database(self, project_id: str, storyboard_payload: dict) -> None:
        """Provisions the ProjectService to handle database orchestration."""
        from px.services.deps import get_project_service

        project_service = get_project_service()
        project_service.ingest_storyboard_payload(project_id, storyboard_payload)
