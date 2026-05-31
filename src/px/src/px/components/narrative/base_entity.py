from portals.custom import CustomComponent
from portals.schema import Data
from portals.services.database.models.folder.model import Folder
from portals.services.deps import get_db_service
from sqlalchemy.orm.attributes import flag_modified
from sqlmodel import select


class BaseEntityReadPatchComponent(CustomComponent):
    # Subclasses will define these
    entity_model: type = None  # e.g., Character, Prop
    storyboard_key: str = ""  # e.g., "characters", "props"

    def get_entity_options(self) -> list[str]:
        """Dynamically fetches entity names from the relational database."""
        flow_id = self.graph.flow_id if self.graph else None
        if not flow_id:
            return ["No active flow context"]

        db_service = get_db_service()
        with db_service.with_session() as session:
            # Find the active project folder via the flow relationship
            statement = select(Folder).where(Folder.flows.any(id=flow_id))
            folder = session.exec(statement).first()

            if not folder:
                return ["No project found"]

            # Query the specific relational table for this project
            entity_statement = select(self.entity_model).where(self.entity_model.project_id == folder.id)
            entities = session.exec(entity_statement).all()

            return [entity.name for entity in entities] if entities else ["No entities found"]

    def _execute_read_patch_logic(
        self, selected_entity_name: str, *, update_database: bool, updated_data: dict
    ) -> Data:
        """Reads the entity and patches both the relational table and storyboard JSON if requested."""
        flow_id = self.graph.flow_id
        db_service = get_db_service()

        with db_service.with_session() as session:
            # 1. Fetch the parent project folder
            statement = select(Folder).where(Folder.flows.any(id=flow_id))
            folder = session.exec(statement).first()

            if not folder:
                return Data(data={"error": "Project folder not found."})

            # 2. Fetch the specific relational entity
            entity_statement = select(self.entity_model).where(
                self.entity_model.project_id == folder.id, self.entity_model.name == selected_entity_name
            )
            target_entity = session.exec(entity_statement).first()

            if not target_entity:
                return Data(data={"error": f"{selected_entity_name} not found in database."})

            # 3. WRITE MODE: Patch the database (Dual-Write)
            if update_database:
                # A. Update the relational record
                for key, value in updated_data.items():
                    if value is not None and value != "":  # Only patch provided fields
                        setattr(target_entity, key, value)

                session.add(target_entity)

                # B. Update the serialized storyboard JSON array [cite: 114]
                if isinstance(folder.storyboard, dict) and self.storyboard_key in folder.storyboard:
                    entity_list = folder.storyboard[self.storyboard_key]

                    # Find and replace the specific entity's dictionary
                    for i, item in enumerate(entity_list):
                        if item.get("id") == str(target_entity.id):
                            entity_list[i] = target_entity.model_dump(mode="json")
                            break

                    folder.storyboard[self.storyboard_key] = entity_list

                    # Explicitly flag the JSON column as modified [cite: 115]
                    flag_modified(folder, "storyboard")
                    session.add(folder)

                # Commit the transaction to lock in both updates [cite: 115]
                session.commit()
                session.refresh(target_entity)

            # 4. READ MODE: Return the entity payload downstream
            return Data(data=target_entity.model_dump(mode="json"))
