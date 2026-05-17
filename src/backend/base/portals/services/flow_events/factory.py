from typing_extensions import override

from portals.services.factory import ServiceFactory
from portals.services.flow_events.service import FlowEventsService


class FlowEventsServiceFactory(ServiceFactory):
    def __init__(self) -> None:
        super().__init__(FlowEventsService)

    @override
    def create(self):
        return FlowEventsService()
