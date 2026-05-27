import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy import Numeric, and_, cast, delete, desc, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from portals.services.database.models.asset_entry.model import (
    AssetEntry,
    AssetEntryCreate,
)
from portals.services.database.models.asset_version.model import (
    AssetVersionCreate,
    AssetVersionRow,
)
from portals.services.database.models.media_object.model import MediaObject

logger = logging.getLogger(__name__)

ENTITY_TYPES = ("scene", "character", "location", "prop", "file", "project")
MEDIA_TYPES: set[str] = {"image", "video", "audio"}
BATCH_SIZE = 100


@dataclass
class Scope:
    """Flat scope descriptor.
    entity_type: one of ENTITY_TYPES.
    entity_ids: list of entity UUIDs for this type.
                For entity_type="project", leave entity_ids empty -- project_id is used directly.
    project_id: always required.
    """

    project_id: UUID
    entity_type: str
    entity_ids: list[UUID] = field(default_factory=list)


class AssetVersionData(BaseModel):
    """Domain model -- NOT the SQLModel table class."""

    id: UUID
    asset_entry_id: UUID
    version: int
    data: str
    type: str
    media_id: str | None = None
    metadata: dict = {}
    user_feedback: dict | None = None
    started_at: datetime
    created_at: datetime


class AssetHistory(BaseModel):
    head: int
    best: int
    versions: list[AssetVersionData]


class UserFeedback(BaseModel):
    rating: str
    comment: str | None = None


AssetRegistry = dict[str, AssetHistory]


@dataclass
class AssetEntryWithVersions:
    entry: AssetEntry
    versions: list[AssetVersionRow]


class AssetVersionManager:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _is_media_type(self, type_: str) -> bool:
        return type_ in MEDIA_TYPES

    async def create_versioned_assets(
        self,
        scope: Scope,
        asset_keys: list[str],
        type_: str | list[str],
        data_list: list[str],
        metadata: dict | list[dict],
        set_best: bool | list[bool] = True,
        started_at: datetime | None = None,
    ) -> list[AssetHistory]:
        self._validate_create_input(scope, len(data_list))
        versions_to_create = self._prepare_versions_to_create(
            data_list,
            type_,
            metadata,
            len(data_list),
            started_at or datetime.now(timezone.utc),
        )
        return await self._save_asset_histories(scope, asset_keys, versions_to_create, set_best)

    async def batch_create_versioned_assets(self, operations: list[tuple]) -> dict:
        histories: list[AssetHistory] = []
        errors: list[dict] = []

        for index, operation in enumerate(operations):
            try:
                histories.extend(await self.create_versioned_assets(*operation))
            except Exception as exc:
                logger.exception("Failed to create versioned assets for operation %s", index)
                errors.append({"index": index, "error": str(exc)})

        return {"histories": histories, "errors": errors}

    async def get_next_version_number(self, scope: Scope, asset_keys: list[str]) -> list[int]:
        histories = await self._resolve_histories_lite(scope, asset_keys)
        return [history.head + 1 for history in histories]

    async def get_best_version(self, scope: Scope, asset_keys: list[str]) -> list[AssetVersionData | None]:
        histories = await self._resolve_histories_full(scope, asset_keys)
        best_versions: list[AssetVersionData | None] = []
        for history in histories:
            if history.best == 0 or not history.versions:
                best_versions.append(None)
                continue
            best_versions.append(
                next(
                    (version for version in history.versions if version.version == history.best),
                    None,
                )
            )
        return best_versions

    async def get_all_versions(self, scope: Scope, asset_keys: list[str]) -> list[list[AssetVersionData]]:
        histories = await self._resolve_histories_full(scope, asset_keys)
        return [sorted(history.versions, key=lambda version: version.version, reverse=True) for history in histories]

    async def get_version_by_number(
        self, scope: Scope, asset_keys: list[str], versions: list[int]
    ) -> list[AssetVersionData | None]:
        histories = await self._resolve_histories_full(scope, asset_keys)
        self._assert_length_match(len(histories), len(versions), "version numbers")
        return [
            next(
                (version for version in history.versions if version.version == versions[index]),
                None,
            )
            for index, history in enumerate(histories)
        ]

    async def set_best_version(
        self, scope: Scope, asset_keys: list[str], version_numbers: list[int]
    ) -> list[AssetHistory]:
        entity_ids = self._scope_entity_ids(scope)
        self._assert_length_match(len(entity_ids), len(version_numbers), "version numbers")
        self._assert_length_match(len(entity_ids), len(asset_keys), "asset keys")

        async with self.session.begin():
            entries = await self._fetch_entries_full(scope, asset_keys)
            for index, entry_with_versions in enumerate(entries):
                target_version = version_numbers[index]
                asset_key = asset_keys[index] if index < len(asset_keys) else asset_keys[0]

                if not entry_with_versions:
                    raise KeyError(
                        f"No asset entry found for {scope.entity_type} {entity_ids[index]} with key {asset_key}"
                    )

                if not any(version.version == target_version for version in entry_with_versions.versions):
                    raise KeyError(f"Version {target_version} not found for asset {asset_key}")

                await self.session.execute(
                    update(AssetEntry)
                    .where(AssetEntry.id == entry_with_versions.entry.id)
                    .values(best=target_version, updated_at=datetime.now(timezone.utc))
                )

            return await self._resolve_histories_full(scope, asset_keys)

    async def record_user_feedback(
        self,
        scope: Scope,
        asset_key: str,
        version_number: int,
        feedback: UserFeedback | None,
    ) -> AssetHistory:
        entity_ids = self._scope_entity_ids(scope)
        if len(entity_ids) != 1:
            raise ValueError("record_user_feedback operates on a single entity at a time")

        async with self.session.begin():
            entry_with_versions = (await self._fetch_entries_full(scope, [asset_key]))[0]

            if not entry_with_versions:
                raise KeyError(f"No asset entry found for key '{asset_key}' on entity '{entity_ids[0]}'")

            if not any(version.version == version_number for version in entry_with_versions.versions):
                raise KeyError(f"Version {version_number} not found for asset '{asset_key}'")

            feedback_payload = feedback.model_dump() if feedback is not None else None
            await self.session.execute(
                update(AssetVersionRow)
                .where(
                    and_(
                        AssetVersionRow.asset_entry_id == entry_with_versions.entry.id,
                        AssetVersionRow.version == version_number,
                    )
                )
                .values(user_feedback=feedback_payload)
            )

            new_best = entry_with_versions.entry.best
            new_locked = entry_with_versions.entry.best_locked_by_feedback
            if feedback and feedback.rating == "liked":
                new_best = version_number
                new_locked = True
            elif feedback is None or feedback.rating == "disliked":
                if new_locked and entry_with_versions.entry.best == version_number:
                    new_locked = False

            await self.session.execute(
                update(AssetEntry)
                .where(AssetEntry.id == entry_with_versions.entry.id)
                .values(
                    best=new_best,
                    best_locked_by_feedback=new_locked,
                    updated_at=datetime.now(timezone.utc),
                )
            )

            return (await self._resolve_histories_full(scope, [asset_key]))[0]

    async def delete_versions(
        self, scope: Scope, asset_keys: list[str], version_numbers: list[int]
    ) -> list[AssetHistory]:
        entity_ids = self._scope_entity_ids(scope)
        self._assert_length_match(len(entity_ids), len(version_numbers), "version numbers")

        async with self.session.begin():
            entries = await self._fetch_entries_full(scope, asset_keys)
            for index, entry_with_versions in enumerate(entries):
                version_to_delete = version_numbers[index]
                if not entry_with_versions:
                    continue

                if entry_with_versions.entry.best == version_to_delete:
                    raise ValueError(f"Cannot delete version {version_to_delete} - it is currently marked as best")

                version_record = next(
                    (version for version in entry_with_versions.versions if version.version == version_to_delete),
                    None,
                )
                if version_record:
                    await self.session.execute(
                        delete(AssetVersionRow).where(
                            and_(
                                AssetVersionRow.asset_entry_id == entry_with_versions.entry.id,
                                AssetVersionRow.version == version_to_delete,
                            )
                        )
                    )

                    if version_record.media_id:
                        await self.session.execute(
                            update(MediaObject)
                            .where(MediaObject.data == version_record.media_id)
                            .values(
                                ref_count=MediaObject.ref_count - 1,
                                last_referenced_at=datetime.now(timezone.utc),
                                status=text("CASE WHEN ref_count - 1 <= 0 THEN 'pending_deletion' ELSE 'active' END"),
                            )
                        )

                if version_to_delete == entry_with_versions.entry.head:
                    remaining_versions = [
                        version.version
                        for version in entry_with_versions.versions
                        if version.version != version_to_delete
                    ]
                    await self.session.execute(
                        update(AssetEntry)
                        .where(AssetEntry.id == entry_with_versions.entry.id)
                        .values(
                            head=max(remaining_versions) if remaining_versions else 0,
                            updated_at=datetime.now(timezone.utc),
                        )
                    )

            return await self._resolve_histories_full(scope, asset_keys)

    async def get_all_scene_assets(self, scene_id: UUID) -> AssetRegistry:
        return await self._get_registry_for_filter(AssetEntry.scene_id == scene_id)

    async def get_all_project_assets(self, project_id: UUID) -> AssetRegistry:
        return await self._get_registry_for_filter(
            and_(
                AssetEntry.project_id == project_id,
                AssetEntry.scene_id.is_(None),
                AssetEntry.character_id.is_(None),
                AssetEntry.location_id.is_(None),
                AssetEntry.file_id.is_(None),
            )
        )

    async def get_all_character_assets(self, character_id: UUID) -> AssetRegistry:
        return await self._get_registry_for_filter(AssetEntry.character_id == character_id)

    async def get_all_location_assets(self, location_id: UUID) -> AssetRegistry:
        return await self._get_registry_for_filter(AssetEntry.location_id == location_id)

    async def get_all_prop_assets(self, prop_id: UUID) -> AssetRegistry:
        return await self._get_registry_for_filter(AssetEntry.prop_id == prop_id)

    async def get_all_file_assets(self, file_id: UUID) -> AssetRegistry:
        return await self._get_registry_for_filter(AssetEntry.file_id == file_id)

    async def get_asset_registry_for_entity(self, entity_id: UUID, entity_type: str) -> AssetRegistry:
        if entity_type == "character":
            return await self.get_all_character_assets(entity_id)
        if entity_type == "location":
            return await self.get_all_location_assets(entity_id)
        if entity_type == "scene":
            return await self.get_all_scene_assets(entity_id)
        if entity_type == "prop":
            return await self.get_all_prop_assets(entity_id)
        if entity_type in {"file", "image"}:
            return await self.get_all_file_assets(entity_id)
        return await self.get_all_project_assets(entity_id)

    async def get_completed_project_videos(
        self,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        limit: int = 50,
        status: str | None = None,
        min_duration: float | None = None,
    ) -> list[dict]:
        conditions = [
            AssetEntry.asset_key == "render_video",
            AssetEntry.scene_id.is_(None),
            AssetEntry.character_id.is_(None),
            AssetEntry.location_id.is_(None),
            AssetEntry.best > 0,
        ]
        if start_date:
            conditions.append(AssetVersionRow.created_at >= start_date)
        if end_date:
            conditions.append(AssetVersionRow.created_at <= end_date)
        if status:
            conditions.append(AssetVersionRow.metadata_["status"].as_string() == status)
        if min_duration is not None:
            conditions.append(cast(AssetVersionRow.metadata_["duration"].as_string(), Numeric) >= min_duration)

        stmt = (
            select(
                AssetEntry.project_id,
                AssetEntry.asset_key,
                AssetVersionRow.version,
                AssetVersionRow.data,
                AssetVersionRow.metadata_,
                AssetVersionRow.created_at,
            )
            .join(
                AssetVersionRow,
                and_(
                    AssetVersionRow.asset_entry_id == AssetEntry.id,
                    AssetVersionRow.version == AssetEntry.best,
                ),
            )
            .where(and_(*conditions))
            .order_by(desc(AssetVersionRow.created_at))
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return [
            {
                "project_id": row.project_id,
                "asset_key": row.asset_key,
                "version": row.version,
                "url": row.data,
                "metadata": row.metadata_,
                "created_at": row.created_at,
            }
            for row in result.all()
        ]

    def _prepare_versions_to_create(
        self,
        data_list: list[str],
        type_: str | list[str],
        metadata: dict | list[dict],
        count: int,
        started_at: datetime,
    ) -> list[dict]:
        versions: list[dict] = []
        for index in range(count):
            version_type = (
                type_[index]
                if isinstance(type_, list) and index < len(type_)
                else type_[0]
                if isinstance(type_, list)
                else type_
            )
            version_metadata = (
                metadata[index]
                if isinstance(metadata, list) and index < len(metadata)
                else metadata[0]
                if isinstance(metadata, list) and metadata
                else metadata
            )
            versions.append(
                {
                    "type": version_type,
                    "data": data_list[index],
                    "metadata": version_metadata or {},
                    "started_at": started_at,
                    "created_at": datetime.now(timezone.utc),
                }
            )
        return versions

    def _validate_create_input(self, scope: Scope, count: int) -> None:
        self._validate_scope(scope)
        expected = 1 if scope.entity_type == "project" else len(scope.entity_ids)
        if count != expected:
            raise ValueError(f"{scope.entity_type.title()} scope expects {expected} data item(s), got {count}")

    def _assert_length_match(self, actual: int, expected: int, label: str) -> None:
        if actual != expected:
            raise ValueError(f"Scope has {actual} entities but {expected} {label} were provided")

    async def _resolve_histories_lite(self, scope: Scope, asset_keys: list[str]) -> list[AssetHistory]:
        entries = await self._fetch_entries_lite(scope, asset_keys)
        return [
            AssetHistory(head=entry.head, best=entry.best, versions=[])
            if entry
            else AssetHistory(head=0, best=0, versions=[])
            for entry in entries
        ]

    async def _resolve_histories_full(self, scope: Scope, asset_keys: list[str]) -> list[AssetHistory]:
        entries = await self._fetch_entries_full(scope, asset_keys)
        histories: list[AssetHistory] = []
        for entry_with_versions in entries:
            if not entry_with_versions:
                histories.append(AssetHistory(head=0, best=0, versions=[]))
                continue
            histories.append(
                AssetHistory(
                    head=entry_with_versions.entry.head,
                    best=entry_with_versions.entry.best,
                    versions=[self._db_version_to_asset_version(row) for row in entry_with_versions.versions],
                )
            )
        return histories

    async def _fetch_entries_lite(self, scope: Scope, asset_keys: list[str]) -> list[AssetEntry | None]:
        entity_ids = self._scope_entity_ids(scope)
        result = await self.session.exec(
            select(AssetEntry).where(self._build_entity_filter(scope.entity_type, entity_ids))
        )
        entries = list(result.all())
        return [
            next(
                (
                    entry
                    for entry in entries
                    if self._matches_entity(entry, scope.entity_type, entity_id)
                    and entry.asset_key == (asset_keys[index] if index < len(asset_keys) else asset_keys[0])
                ),
                None,
            )
            for index, entity_id in enumerate(entity_ids)
        ]

    async def _fetch_entries_full(self, scope: Scope, asset_keys: list[str]) -> list[AssetEntryWithVersions | None]:
        entity_ids = self._scope_entity_ids(scope)
        stmt = (
            select(AssetEntry, AssetVersionRow)
            .join(
                AssetVersionRow,
                AssetVersionRow.asset_entry_id == AssetEntry.id,
                isouter=True,
            )
            .where(self._build_entity_filter(scope.entity_type, entity_ids))
            .order_by(AssetVersionRow.version)
        )
        result = await self.session.execute(stmt)
        entry_map: dict[UUID, AssetEntryWithVersions] = {}
        for entry, version in result.all():
            if entry.id not in entry_map:
                entry_map[entry.id] = AssetEntryWithVersions(entry=entry, versions=[])
            if version:
                entry_map[entry.id].versions.append(version)

        entries = list(entry_map.values())
        return [
            next(
                (
                    entry_with_versions
                    for entry_with_versions in entries
                    if self._matches_entity(entry_with_versions.entry, scope.entity_type, entity_id)
                    and entry_with_versions.entry.asset_key
                    == (asset_keys[index] if index < len(asset_keys) else asset_keys[0])
                ),
                None,
            )
            for index, entity_id in enumerate(entity_ids)
        ]

    def _build_entity_filter(self, entity_type: str, entity_ids: list[UUID]):
        if entity_type == "scene":
            return AssetEntry.scene_id.in_(entity_ids)
        if entity_type == "character":
            return AssetEntry.character_id.in_(entity_ids)
        if entity_type == "location":
            return AssetEntry.location_id.in_(entity_ids)
        if entity_type == "prop":
            return AssetEntry.prop_id.in_(entity_ids)
        if entity_type == "file":
            return AssetEntry.file_id.in_(entity_ids)
        if entity_type == "project":
            return and_(
                AssetEntry.project_id.in_(entity_ids),
                AssetEntry.scene_id.is_(None),
                AssetEntry.character_id.is_(None),
                AssetEntry.location_id.is_(None),
                AssetEntry.file_id.is_(None),
            )
        raise ValueError(f"Unknown entity type: {entity_type}")

    def _matches_entity(self, entry: AssetEntry, entity_type: str, entity_id: UUID) -> bool:
        if entity_type == "scene":
            return entry.scene_id == entity_id
        if entity_type == "character":
            return entry.character_id == entity_id
        if entity_type == "location":
            return entry.location_id == entity_id
        if entity_type == "prop":
            return entry.prop_id == entity_id
        if entity_type == "file":
            return entry.file_id == entity_id
        if entity_type == "project":
            return (
                entry.project_id == entity_id
                and entry.scene_id is None
                and entry.character_id is None
                and entry.location_id is None
                and entry.file_id is None
            )
        return False

    async def _save_asset_histories(
        self,
        scope: Scope,
        asset_keys: list[str],
        new_versions_input: list[dict],
        set_best: bool | list[bool],
    ) -> list[AssetHistory]:
        entity_ids = self._scope_entity_ids(scope)
        async with self.session.begin():
            current_entries = await self._fetch_entries_lite(scope, asset_keys)
            entry_state_map: dict[str, AssetEntry] = {}
            versions_to_insert: list[AssetVersionRow] = []
            updated_histories: list[AssetHistory] = []

            for index, new_version_input in enumerate(new_versions_input):
                entity_id = entity_ids[index]
                asset_key = asset_keys[index] if index < len(asset_keys) else asset_keys[0]
                unique_key = f"{entity_id}:{asset_key}"
                entry_state = entry_state_map.get(unique_key)

                if not entry_state:
                    db_entry = current_entries[index]
                    entry_payload = AssetEntryCreate(
                        project_id=scope.project_id,
                        scene_id=entity_id if scope.entity_type == "scene" else None,
                        character_id=entity_id if scope.entity_type == "character" else None,
                        location_id=entity_id if scope.entity_type == "location" else None,
                        prop_id=entity_id if scope.entity_type == "prop" else None,
                        file_id=entity_id if scope.entity_type == "file" else None,
                        asset_key=asset_key,
                        head=db_entry.head if db_entry else 0,
                        best=db_entry.best if db_entry else 0,
                        best_locked_by_feedback=db_entry.best_locked_by_feedback if db_entry else False,
                    )
                    entry_state = AssetEntry(
                        id=db_entry.id if db_entry else uuid4(),
                        created_at=db_entry.created_at if db_entry else datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc),
                        **entry_payload.model_dump(),
                    )

                should_set_best = (
                    set_best[index]
                    if isinstance(set_best, list) and index < len(set_best)
                    else set_best
                    if isinstance(set_best, bool)
                    else False
                )
                new_version_number = entry_state.head + 1
                is_locked = entry_state.best_locked_by_feedback is True
                new_best = (
                    new_version_number
                    if entry_state.best == 0 or (should_set_best and not is_locked)
                    else entry_state.best
                )

                entry_state.head = new_version_number
                entry_state.best = new_best
                entry_state.updated_at = datetime.now(timezone.utc)
                entry_state_map[unique_key] = entry_state

                version_create = AssetVersionCreate(
                    asset_entry_id=entry_state.id,
                    version=new_version_number,
                    data=new_version_input["data"],
                    type=new_version_input["type"],
                    metadata_=new_version_input.get("metadata") or {},
                    started_at=new_version_input["started_at"],
                    created_at=new_version_input["created_at"],
                )
                version_row = AssetVersionRow(id=uuid4(), **version_create.model_dump())
                version_row.media_id = version_row.data if self._is_media_type(version_row.type) else None
                versions_to_insert.append(version_row)
                updated_histories.append(
                    AssetHistory(
                        head=new_version_number,
                        best=new_best,
                        versions=[self._db_version_to_asset_version(version_row)],
                    )
                )

            await self._batch_upsert_entries(list(entry_state_map.values()))
            await self._batch_insert_versions(versions_to_insert)
            return updated_histories

    async def _batch_upsert_entries(self, entries: list[AssetEntry]) -> list[AssetEntry]:
        if not entries:
            return []

        entries_sorted = sorted(entries, key=lambda entry: str(entry.id))
        results: list[AssetEntry] = []
        for index in range(0, len(entries_sorted), BATCH_SIZE):
            batch = entries_sorted[index : index + BATCH_SIZE]
            stmt = (
                pg_insert(AssetEntry)
                .values([entry.model_dump() for entry in batch])
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={
                        "head": text("EXCLUDED.head"),
                        "best": text("EXCLUDED.best"),
                        "updated_at": text("EXCLUDED.updated_at"),
                    },
                )
                .returning(AssetEntry)
            )
            result = await self.session.execute(stmt)
            results.extend(result.scalars().all())
        return results

    async def _batch_insert_versions(self, versions: list[AssetVersionRow]) -> None:
        if not versions:
            return

        media_counts: dict[str, int] = {}
        for version in versions:
            if self._is_media_type(version.type):
                media_counts[version.data] = media_counts.get(version.data, 0) + 1
                version.media_id = version.data
            else:
                version.media_id = None

        now = datetime.now(timezone.utc)
        for uri, count in media_counts.items():
            stmt = (
                pg_insert(MediaObject)
                .values(
                    data=uri,
                    ref_count=count,
                    status="active",
                    created_at=now,
                    last_referenced_at=now,
                )
                .on_conflict_do_update(
                    index_elements=["data"],
                    set_={
                        "ref_count": MediaObject.ref_count + count,
                        "last_referenced_at": now,
                        "status": "active",
                    },
                )
            )
            await self.session.execute(stmt)

        for index in range(0, len(versions), BATCH_SIZE):
            batch = versions[index : index + BATCH_SIZE]
            await self.session.execute(
                AssetVersionRow.__table__.insert(),
                [self._version_row_to_values(version) for version in batch],
            )

    def _build_registry_from_entries(self, entries: list[AssetEntry], versions: list[AssetVersionRow]) -> AssetRegistry:
        versions_by_entry_id: dict[UUID, list[AssetVersionRow]] = {}
        for version in versions:
            versions_by_entry_id.setdefault(version.asset_entry_id, []).append(version)

        registry: AssetRegistry = {}
        for entry in entries:
            registry[entry.asset_key] = AssetHistory(
                head=entry.head,
                best=entry.best,
                versions=[
                    self._db_version_to_asset_version(version) for version in versions_by_entry_id.get(entry.id, [])
                ],
            )
        return registry

    def _db_version_to_asset_version(self, row: AssetVersionRow) -> AssetVersionData:
        if row.started_at is None or row.created_at is None:
            raise ValueError("Asset version rows must have started_at and created_at timestamps")
        return AssetVersionData(
            id=row.id,
            asset_entry_id=row.asset_entry_id,
            version=row.version,
            data=row.data,
            type=row.type,
            media_id=row.media_id,
            metadata=row.metadata_ or {},
            user_feedback=row.user_feedback,
            started_at=row.started_at,
            created_at=row.created_at,
        )

    async def _get_registry_for_filter(self, filter_expression: Any) -> AssetRegistry:
        result = await self.session.exec(select(AssetEntry).where(filter_expression))
        entries = list(result.all())
        if not entries:
            return {}

        entry_ids = [entry.id for entry in entries]
        versions_result = await self.session.exec(
            select(AssetVersionRow)
            .where(AssetVersionRow.asset_entry_id.in_(entry_ids))
            .order_by(AssetVersionRow.version)
        )
        versions = list(versions_result.all())
        return self._build_registry_from_entries(entries, versions)

    def _scope_entity_ids(self, scope: Scope) -> list[UUID]:
        self._validate_scope(scope)
        return [scope.project_id] if scope.entity_type == "project" else scope.entity_ids

    def _validate_scope(self, scope: Scope) -> None:
        if scope.entity_type not in ENTITY_TYPES:
            raise ValueError(f"entity_type must be one of {ENTITY_TYPES}")
        if scope.entity_type != "project" and not scope.entity_ids:
            raise ValueError(f"{scope.entity_type} scope requires at least one entity_id")

    def _version_row_to_values(self, version: AssetVersionRow) -> dict:
        return {
            "id": version.id,
            "asset_entry_id": version.asset_entry_id,
            "version": version.version,
            "data": version.data,
            "media_id": version.media_id,
            "type": version.type,
            "metadata": version.metadata_ or {},
            "user_feedback": version.user_feedback,
            "started_at": version.started_at,
            "created_at": version.created_at,
        }
