"""FastAPI routes for nap-core integration.

Provides the REST API that bridges Portals frontend state to the
Narrative Addressing Protocol storage layer.

All CPU-bound ``NapRepository`` calls are dispatched via
``run_in_threadpool()`` to avoid blocking the async event loop
(Gotcha #4).
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from px.log.logger import logger
from pydantic import BaseModel

from portals.api.utils import CurrentActiveUser
from portals.services.nap import (
    CommitRef,
    ManifestRef,
    NapService,
    get_nap_service,
)

router = APIRouter(
    prefix="/nap",
    tags=["NAP"],
)


# ═══════════════════════════════════════════════════════════════════════
# Request / Response models
# ═══════════════════════════════════════════════════════════════════════


class CreateEntityRequest(BaseModel):
    entity_type: str
    """The type of entity to create (e.g. ``"character"``, ``"location"``)."""

    project_id: str
    """The project/workspace UUID this entity belongs to."""

    initial_data: dict[str, Any] | None = None
    """Optional initial manifest data."""


class CreateEntityResponse(BaseModel):
    uri: str
    """The fully-qualified nap URI for the newly created entity."""

    commit_hash: str
    """The SHA commit hash of the initial revision."""

    entity_id: str
    """The UUID assigned to the new entity."""


class PublishRequest(BaseModel):
    uri: str
    """The nap URI to publish to."""

    base_commit_hash: str
    """The commit hash the caller's merge preview was generated against.
    The backend validates that ``HEAD`` still points to this commit
    (optimistic locking)."""

    resolved_manifest: dict[str, Any]
    """The complete resolved manifest to persist.  Must include all
    non-conflicting merged fields **and** the caller's conflict
    resolution choices."""


class PublishSuccessResponse(BaseModel):
    commit_hash: str
    """The new SHA commit hash."""


class ConflictItem(BaseModel):
    path: str
    """Dot-separated JSON pointer to the conflicting field."""

    base: Any = None
    """Value in the base manifest (common ancestor)."""

    current: Any = None
    """Value in the current ``HEAD`` manifest."""

    proposed: Any = None
    """Value in the proposed draft manifest."""


class PublishConflictResponse(BaseModel):
    detail: str = "HEAD has moved since merge preview was generated. Re-merge and try again."
    conflicts: list[ConflictItem]


class MergePreviewRequest(BaseModel):
    uri: str
    """The nap URI to generate a merge preview for."""

    base_commit_hash: str
    """The commit hash of the caller's baseline."""

    proposed_manifest: dict[str, Any]
    """The proposed (draft) manifest to merge."""


class MergePreviewResponse(BaseModel):
    merged_manifest: dict[str, Any]
    """The auto-merged manifest.  Non-conflicting paths are final."""

    conflicts: list[ConflictItem]
    """Fields that could not be auto-merged."""


class DiffRequest(BaseModel):
    uri: str | None = None
    """Required when referencing commits."""

    from_commit: str | None = None
    """Left-hand commit hash."""

    to_commit: str | None = None
    """Right-hand commit hash."""

    from_manifest: dict[str, Any] | None = None
    """Left-hand inline manifest."""

    to_manifest: dict[str, Any] | None = None
    """Right-hand inline manifest."""


class DiffChangeItem(BaseModel):
    path: str
    kind: str  # "added" | "modified" | "removed"
    before: Any = None
    after: Any = None


class DiffResponse(BaseModel):
    changes: list[DiffChangeItem]


# ═══════════════════════════════════════════════════════════════════════
# Dependency: get the nap service
# ═══════════════════════════════════════════════════════════════════════


def _get_nap() -> NapService:
    service = get_nap_service()
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NAP service not initialized. Please start the server with nap-core enabled.",
        )
    return service


NapDep = Annotated[NapService, Depends(_get_nap)]


# ═══════════════════════════════════════════════════════════════════════
# Routes
# ═══════════════════════════════════════════════════════════════════════


@router.post(
    "/create",
    response_model=CreateEntityResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new narrative entity",
)
async def create_entity(
    body: CreateEntityRequest,
    nap: NapDep,
    _current_user: CurrentActiveUser,
) -> CreateEntityResponse:
    """Create a new narrative entity and return its nap URI + commit hash.

    This is the **single entry point** for entity creation used by both
    human users (via the canvas UI) and AI agents (via graph execution).
    """
    try:
        result = await nap.create_entity(
            entity_type=body.entity_type,
            project_id=body.project_id,
            initial_data=body.initial_data,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    logger.info(
        "Created NAP entity: uri=%s commit=%s type=%s project=%s",
        result.uri,
        result.commit_hash,
        body.entity_type,
        body.project_id,
    )

    return CreateEntityResponse(
        uri=result.uri,
        commit_hash=result.commit_hash,
        entity_id=result.entity_id,
    )


@router.post(
    "/publish",
    response_model=PublishSuccessResponse,
    responses={
        409: {"model": PublishConflictResponse},
    },
    summary="Publish a resolved manifest",
)
async def publish_entity(
    body: PublishRequest,
    nap: NapDep,
    _current_user: CurrentActiveUser,
) -> PublishSuccessResponse:
    """Publish a resolved manifest to the nap repository.

    The backend performs optimistic locking: if ``HEAD`` has moved
    since the caller generated their merge preview, a ``409 Conflict``
    is returned with the new conflicts, and the caller must re-merge.
    """
    try:
        result = await nap.publish(
            uri=body.uri,
            base_commit_hash=body.base_commit_hash,
            resolved_manifest=body.resolved_manifest,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if result.is_success:
        logger.info(
            "Published NAP entity: uri=%s commit=%s",
            body.uri,
            result.commit_hash,
        )
        return PublishSuccessResponse(commit_hash=result.commit_hash)

    # 409 Conflict — HEAD moved
    conflict_items = [
        ConflictItem(
            path=c.path,
            base=c.base,
            current=c.current,
            proposed=c.proposed,
        )
        for c in result.conflicts
    ]

    logger.warning(
        "Publish conflict for %s: %d conflict(s)",
        body.uri,
        len(conflict_items),
    )

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=PublishConflictResponse(conflicts=conflict_items).model_dump(),
    )


@router.post(
    "/merge",
    response_model=MergePreviewResponse,
    summary="Generate a merge preview (without persisting)",
)
async def merge_preview(
    body: MergePreviewRequest,
    nap: NapDep,
    _current_user: CurrentActiveUser,
) -> MergePreviewResponse:
    """Generate a structured merge preview without persisting anything.

    Returns the auto-merged manifest and any conflicting fields.
    The frontend uses this to display a conflict resolution UI.
    """
    try:
        preview = await nap.merge(
            uri=body.uri,
            base_commit_hash=body.base_commit_hash,
            proposed_manifest=body.proposed_manifest,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    conflict_items = [
        ConflictItem(
            path=c.path,
            base=c.base,
            current=c.current,
            proposed=c.proposed,
        )
        for c in preview.conflicts
    ]

    return MergePreviewResponse(
        merged_manifest=preview.merged_manifest,
        conflicts=conflict_items,
    )


@router.post(
    "/diff",
    response_model=DiffResponse,
    summary="Compute a semantic diff between two manifests",
)
async def diff_manifests(
    body: DiffRequest,
    nap: NapDep,
    _current_user: CurrentActiveUser,
) -> DiffResponse:
    """Compute a semantic diff between two manifest references.

    Supports three operand forms:

    * **Commit → Commit** — provide ``uri`` + ``from_commit`` + ``to_commit``
    * **Commit → Draft** — provide ``uri`` + ``from_commit`` + ``to_manifest``
    * **Manifest → Manifest** — provide ``from_manifest`` + ``to_manifest``
    """
    # Validate operand combinations
    if body.from_manifest is not None and body.to_manifest is not None:
        from_ref: CommitRef | ManifestRef = ManifestRef(manifest=body.from_manifest)
        to_ref = ManifestRef(manifest=body.to_manifest)
        uri = None
    elif body.from_commit is not None and body.to_commit is not None:
        if not body.uri:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="uri is required when diffing commit references",
            )
        from_ref = CommitRef(commit=body.from_commit)
        to_ref = CommitRef(commit=body.to_commit)
        uri = body.uri
    elif body.from_commit is not None and body.to_manifest is not None:
        if not body.uri:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="uri is required when diffing commit against manifest",
            )
        from_ref = CommitRef(commit=body.from_commit)
        to_ref = ManifestRef(manifest=body.to_manifest)
        uri = body.uri
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid diff operand combination. Provide "
            "(from_commit + to_commit + uri), "
            "(from_commit + to_manifest + uri), or "
            "(from_manifest + to_manifest).",
        )

    try:
        changes = await nap.diff(uri=uri, from_ref=from_ref, to_ref=to_ref)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return DiffResponse(
        changes=[
            DiffChangeItem(
                path=c.path,
                kind=c.kind,
                before=c.before,
                after=c.after,
            )
            for c in changes
        ],
    )


@router.post(
    "/media/upload",
    summary="Upload a media file to the content-addressed asset store",
)
async def upload_media(
    file: Annotated[UploadFile, File(...)],
    nap: Annotated[NapDep, Depends(_get_nap)],
    _current_user: Annotated[CurrentActiveUser, Depends],
) -> dict:
    """Upload a media file and return its content-addressed SHA-256 hash.

    The file is stored in ``<NAP_STORAGE_DIR>/.nap-assets/`` and served
    via the ``/api/assets/{hash}`` static route.

    The response format is:

    .. code-block:: json

        {"hash": "sha256:abc123def456..."}
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )

    # Validate content type
    if file.content_type and not file.content_type.startswith(("image/", "audio/", "video/", "text/", "application/")):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type: {file.content_type}",
        )

    try:
        data = await file.read()
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty file",
            )

        content_hash = await nap.ingest_media(
            data=data,
            fmt=file.content_type or "application/octet-stream",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Media upload failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Media upload failed: {exc}",
        ) from exc

    logger.info(
        "Uploaded media: filename=%s size=%d hash=%s",
        file.filename,
        len(data),
        content_hash,
    )

    return {"hash": content_hash}
