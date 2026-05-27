from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from px.log import logger
from pydantic import BaseModel

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services.asset_version_manager import (
    AssetVersionManager,
    Scope,
    UserFeedback,
)
from portals.services.database.models.block.model import Block, BlockCreate, BlockRead

router = APIRouter(prefix="/canvas", tags=["Canvas"], include_in_schema=False)


class AssetCreateRequest(BaseModel):
    project_id: UUID
    entity_id: UUID
    entity_type: str
    asset_key: str
    url: str


class AssetSetBestRequest(BaseModel):
    entity_id: UUID
    entity_type: str
    asset_key: str
    version: int
    project_id: UUID


class AssetFeedbackRequest(BaseModel):
    entity_id: UUID
    entity_type: str
    asset_key: str
    version_number: int
    feedback: dict | None


class AssetDeleteVersionRequest(BaseModel):
    entity_id: UUID
    entity_type: str
    asset_key: str
    version_number: int
    project_id: UUID


class VideoFilterParams(BaseModel):
    start_date: datetime | None = None
    end_date: datetime | None = None
    limit: int = 50
    status: str | None = None
    min_duration: float = 12.0


class StoryblocksCreateRequest(BaseModel):
    project_id: UUID
    blocks: list[BlockCreate]


def _scope(project_id: UUID, entity_type: str, entity_id: UUID) -> Scope:
    if entity_type == "project":
        return Scope(project_id=project_id, entity_type="project")
    return Scope(project_id=project_id, entity_type=entity_type, entity_ids=[entity_id])


def _raise_canvas_error(exc: Exception) -> None:
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, KeyError):
        raise HTTPException(status_code=404, detail=str(exc).strip("'")) from exc
    if isinstance(exc, ValueError):
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.exception("Unhandled canvas API error")
    raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/projects/{project_id}/assets")
async def get_project_assets(project_id: UUID, current_user: CurrentActiveUser, session: DbSession):
    _ = current_user
    try:
        return await AssetVersionManager(session).get_all_project_assets(project_id)
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.get("/projects/{project_id}/assets/scenes/{scene_id}")
async def get_scene_assets(
    project_id: UUID,
    scene_id: UUID,
    current_user: CurrentActiveUser,
    session: DbSession,
):
    _ = (project_id, current_user)
    try:
        return await AssetVersionManager(session).get_all_scene_assets(scene_id)
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.get("/projects/{project_id}/assets/characters/{character_id}")
async def get_character_assets(
    project_id: UUID,
    character_id: UUID,
    current_user: CurrentActiveUser,
    session: DbSession,
):
    _ = (project_id, current_user)
    try:
        return await AssetVersionManager(session).get_all_character_assets(character_id)
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.get("/projects/{project_id}/assets/locations/{location_id}")
async def get_location_assets(
    project_id: UUID,
    location_id: UUID,
    current_user: CurrentActiveUser,
    session: DbSession,
):
    _ = (project_id, current_user)
    try:
        return await AssetVersionManager(session).get_all_location_assets(location_id)
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.get("/projects/{project_id}/assets/props/{prop_id}")
async def get_prop_assets(project_id: UUID, prop_id: UUID, current_user: CurrentActiveUser, session: DbSession):
    _ = (project_id, current_user)
    try:
        return await AssetVersionManager(session).get_all_prop_assets(prop_id)
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.get("/assets/{entity_type}/{entity_id}")
async def get_entity_assets(
    entity_type: str,
    entity_id: UUID,
    current_user: CurrentActiveUser,
    session: DbSession,
):
    _ = current_user
    try:
        return await AssetVersionManager(session).get_asset_registry_for_entity(entity_id, entity_type)
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.post("/assets")
async def create_asset_version(body: AssetCreateRequest, current_user: CurrentActiveUser, session: DbSession):
    _ = current_user
    try:
        manager = AssetVersionManager(session)
        return await manager.create_versioned_assets(
            _scope(body.project_id, body.entity_type, body.entity_id),
            [body.asset_key],
            "image",
            [body.url],
            {},
        )
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.patch("/assets/best")
async def set_asset_best_version(body: AssetSetBestRequest, current_user: CurrentActiveUser, session: DbSession):
    _ = current_user
    try:
        return await AssetVersionManager(session).set_best_version(
            _scope(body.project_id, body.entity_type, body.entity_id),
            [body.asset_key],
            [body.version],
        )
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.post("/assets/feedback")
async def record_asset_feedback(body: AssetFeedbackRequest, current_user: CurrentActiveUser, session: DbSession):
    _ = current_user
    try:
        feedback = UserFeedback.model_validate(body.feedback) if body.feedback is not None else None
        project_id = body.entity_id if body.entity_type == "project" else body.entity_id
        return await AssetVersionManager(session).record_user_feedback(
            _scope(project_id, body.entity_type, body.entity_id),
            body.asset_key,
            body.version_number,
            feedback,
        )
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.delete("/assets/versions")
async def delete_asset_version(body: AssetDeleteVersionRequest, current_user: CurrentActiveUser, session: DbSession):
    _ = current_user
    try:
        return await AssetVersionManager(session).delete_versions(
            _scope(body.project_id, body.entity_type, body.entity_id),
            [body.asset_key],
            [body.version_number],
        )
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.get("/videos")
async def list_completed_videos(
    current_user: CurrentActiveUser,
    session: DbSession,
    filters: Annotated[VideoFilterParams, Depends()],
):
    _ = current_user
    try:
        videos = await AssetVersionManager(session).get_completed_project_videos(
            start_date=filters.start_date,
            end_date=filters.end_date,
            limit=filters.limit,
            status=filters.status,
            min_duration=filters.min_duration,
        )
        return {"success": True, "count": len(videos), "data": videos}
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)


@router.post("/storyblocks")
async def create_storyblocks(body: StoryblocksCreateRequest, current_user: CurrentActiveUser, session: DbSession):
    _ = current_user
    try:
        blocks = [
            Block(project_id=body.project_id, **block.model_dump(exclude={"project_id"})) for block in body.blocks
        ]
        session.add_all(blocks)
        await session.flush()
        for block in blocks:
            await session.refresh(block)
        return {
            "success": True,
            "count": len(blocks),
            "blocks": [BlockRead.model_validate(block, from_attributes=True) for block in blocks],
        }
    except Exception as exc:  # noqa: BLE001
        _raise_canvas_error(exc)
