"""Project Service.

Encapsulates all database operations for Cinematic Canvas projects (Folders),
including batched entity ingestion and storyboard merges.
"""

from typing import Any, Dict, List, Type
from portals.services.deps import session_scope
from sqlmodel import select, Session
from sqlalchemy.orm.attributes import flag_modified
import logging

from portals.services.base import Service
from portals.services.database.models.folder.model import Folder
from portals.services.database.models.character.model import Character
from portals.services.database.models.location.model import Location
from portals.services.database.models.prop.model import Prop
# Assuming a Scene model exists in the schema
# from portals.services.database.models.scene.model import Scene 

from px.log.logger import logger
from px.components.narrative.storyboard_manager import StoryboardManager

class ProjectService(Service):
    name = "project_service"

    def ingest_storyboard_payload(self, project_id: str, storyboard_payload: Dict[str, Any]) -> None:
        """
        Master method to deduplicate, batch upsert entities, and update the project storyboard.
        """
        logger.info(f"[ProjectService.ingest_storyboard_payload] Initiating ingestion for project_id: {project_id}")
        
        with session_scope() as session:
            try:
                # 1. Deduplicate incoming payload
                deduped_characters = self._deduplicate_entities(storyboard_payload.get("characters", []))
                deduped_locations = self._deduplicate_entities(storyboard_payload.get("locations", []))
                deduped_props = self._deduplicate_entities(storyboard_payload.get("props", []))
                # deduped_scenes = self._deduplicate_entities(storyboard_payload.get("scenes", []))

                # 2. Batch Upsert Entities
                self._batch_upsert_entities(project_id, Character, deduped_characters)
                self._batch_upsert_entities(project_id, Location, deduped_locations)
                self._batch_upsert_entities(project_id, Prop, deduped_props)
                # self._batch_upsert_entities(project_id, Scene, deduped_scenes)

                # 3. Merge and Save Storyboard JSON
                self._merge_project_storyboard(project_id, storyboard_payload)
                
                session.commit()
                logger.info(f"[ProjectService.ingest_storyboard_payload] Successfully committed payload for project_id: {project_id}")
            
            except Exception as execution_error:
                session.rollback()
                logger.error(f"[ProjectService.ingest_storyboard_payload] Fatal error during ingestion. Transaction rolled back. Root cause: {execution_error}", exc_info=True)
                raise

    def _deduplicate_entities(self, entities: List[Dict[str, Any]], unique_key: str = "name") -> List[Dict[str, Any]]:
        """Deduplicates a list of dictionaries based on a unique key, favoring the last occurrence."""
        if not entities:
            return []
        
        deduplicated_map = {entity.get(unique_key): entity for entity in entities if entity.get(unique_key)}
        logger.debug(f"[ProjectService._deduplicate_entities] Reduced {len(entities)} raw entities to {len(deduplicated_map)} unique entities.")
        return list(deduplicated_map.values())

    def _batch_upsert_entities(self, project_id: str, model_class: Type, entities: List[Dict[str, Any]]) -> None:
        """
        Performs a batched read-diff-write operation to create or update entities.
        Uses 'name' as the composite lookup key with project_id.
        """
        if not entities:
            return

        model_name = model_class.__name__
        logger.info(f"[ProjectService._batch_upsert_entities] Processing {len(entities)} {model_name}(s) for project_id: {project_id}")

        incoming_names = [e.get("name") for e in entities if e.get("name")]
        
        with session_scope() as session:

            # Batched read
            statement = select(model_class).where(
                model_class.project_id == project_id,
                model_class.name.in_(incoming_names)
            )
            existing_records = session.exec(statement).all()
            existing_record_map = {record.name: record for record in existing_records}

            records_to_add = []
            update_count = 0

            for incoming_data in entities:
                entity_name = incoming_data.get("name")
                if not entity_name:
                    continue

                if entity_name in existing_record_map:
                    # Update existing
                    existing_record = existing_record_map[entity_name]
                    for key, value in incoming_data.items():
                        if hasattr(existing_record, key) and key not in ['id', 'project_id']:
                            setattr(existing_record, key, value)
                    update_count += 1
                else:
                    # Create new
                    new_record = model_class(**incoming_data, project_id=project_id)
                    records_to_add.append(new_record)

            if records_to_add:
                session.add_all(records_to_add)
                
            logger.info(f"[ProjectService._batch_upsert_entities] {model_name} sync complete. Created: {len(records_to_add)}, Updated: {update_count}")

    def _merge_project_storyboard(self, project_id: str, generated_payload: Dict[str, Any]) -> None:
        with session_scope() as session:
            """Merges the generated storyboard JSON into the Folder's storyboard column."""
            statement = select(Folder).where(Folder.id == project_id)
            folder = session.exec(statement).first()
            
            if not folder:
                raise ValueError(f"Project folder '{project_id}' not found in database.")

            merged_storyboard = StoryboardManager.merge_into_project(
                current_storyboard=folder.storyboard or {},
                generated=generated_payload,
            )

            folder.storyboard = merged_storyboard
            flag_modified(folder, "storyboard")
            session.add(folder)
            logger.info(f"[ProjectService._merge_project_storyboard] Storyboard JSON merged for project_id: {project_id}")