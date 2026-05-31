from portals.custom import CustomComponent
from portals.schema import Data

# Import your updated schemas from your specific backend paths
from portals.services.database.models import Folder
from portals.services.database.models.flow.model import Flow
from portals.services.deps import get_db_service
from sqlmodel import select


class GetProjectComponent(CustomComponent):
    display_name = "Get Project"
    description = (
        "Queries the database to retrieve global project state (storyboard, generation rules, etc.) for downstream use."
    )
    icon = "folder-search"

    def build(self) -> Data:
        # Get the ID of the flow currently executing this vertex
        current_flow_id = self.graph.flow_id

        db_service = get_db_service()
        with db_service.get_session() as session:
            # Join Flow and Folder to find the parent project automatically
            statement = select(Folder).join(Flow).where(Flow.id == current_flow_id)
            folder = session.exec(statement).first()

            if not folder:
                msg = "Could not resolve parent project folder for this flow."
                raise ValueError(msg)

            payload = {
                "storyboard": folder.storyboard,
                "generation_rules": folder.generation_rules,
                # ... other fields
            }
            return Data(data=payload)
