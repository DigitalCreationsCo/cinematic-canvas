from fastapi_pagination import Page

from portals.helpers.base_model import BaseModel
from portals.services.database.models.flow.model import FlowRead
from portals.services.database.models.folder.model import FolderRead


class FolderWithPaginatedFlows(BaseModel):
    folder: FolderRead
    flows: Page[FlowRead]
