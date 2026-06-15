from __future__ import annotations

from portals.services.project.service import ProjectService
from portals.services.factory import ServiceFactory


class ProjectServiceFactory(ServiceFactory):
    def __init__(self) -> None:
        super().__init__(ProjectService)

    def create(self):
        
            return ProjectService()
