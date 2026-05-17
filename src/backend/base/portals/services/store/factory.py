from __future__ import annotations

from typing import TYPE_CHECKING

from portals.services.factory import ServiceFactory
from portals.services.store.service import StoreService
from typing_extensions import override

if TYPE_CHECKING:
    from px.services.settings.service import SettingsService


class StoreServiceFactory(ServiceFactory):
    def __init__(self) -> None:
        super().__init__(StoreService)

    @override
    def create(self, settings_service: SettingsService):
        return StoreService(settings_service)
