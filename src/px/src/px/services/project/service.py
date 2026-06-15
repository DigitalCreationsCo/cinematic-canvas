from abc import ABC, abstractmethod
from typing import Any, Dict, List, Type

from px.services.base import Service

class ProjectService(Service):
    """
    Abstract base class for Cinematic Canvas project services.
    Defines the contract for database operations, entity ingestion, and storyboard merges.
    """

    @abstractmethod
    def ingest_storyboard_payload(self, project_id: str, storyboard_payload: Dict[str, Any]) -> None:
        """
        Master method to orchestrate deduplication, batch ingestion, and storyboard updates.
        Must be implemented to manage the execution lifecycle and session transactions.
        """
        pass

    @abstractmethod
    def _batch_upsert_entities(self, project_id: str, model_class: Type, entities: List[Dict[str, Any]]) -> None:
        """
        Defines how a batch of model entities (Characters, Locations, Props) are synced or updated.
        """
        pass

    @abstractmethod
    def _merge_project_storyboard(self, project_id: str, generated_payload: Dict[str, Any]) -> None:
        """
        Defines how the storyboard JSON state is merged into the project's root record.
        """
        pass

    def _deduplicate_entities(self, entities: List[Dict[str, Any]], unique_key: str = "name") -> List[Dict[str, Any]]:
        """
        Deduplicates a list of dictionaries based on a unique key, favoring the last occurrence.
        Provided as a default utility but can be overridden if custom matching logic is required.
        """
        if not entities:
            return []
        deduplicated_map = {entity.get(unique_key): entity for entity in entities if entity.get(unique_key)}
        return list(deduplicated_map.values())
