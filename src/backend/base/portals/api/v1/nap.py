"""FastAPI routes for nap-core integration.

Provides the REST API that bridges Portals frontend state to the
Narrative Addressing Protocol storage layer.

All CPU-bound ``NapRepository`` calls are dispatched via
``run_in_threadpool()`` to avoid blocking the async event loop
(Gotcha #4).
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from px.log.logger import logger
from pydantic import BaseModel
from sqlmodel import select

from portals.api.utils import CurrentActiveUser, DbSession
from portals.services.database.models.folder.model import Folder, FolderRead
from portals.services.database.models.nap_repository.model import (
    NapRepository,
    NapRepositoryDetail,
    NapRepositoryRead,
    ProjectRepositoryLink,
)
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


# ═══════════════════════════════════════════════════════════════════════
# Repository / universe-level endpoints
# ═══════════════════════════════════════════════════════════════════════


class CreateRepositoryRequest(BaseModel):
    folder_id: str
    name: str
    repo_type: str = "local"
    remote_url: str | None = None


class CloneRepositoryRequest(BaseModel):
    repo_id: str
    remote_url: str


class PushRepositoryRequest(BaseModel):
    repo_id: str
    remote_url: str


class EntitySummaryResponse(BaseModel):
    uri: str
    entity_type: str
    entity_id: str
    commit_hash: str | None = None
    updated_at: float | None = None


class CommitSummaryResponse(BaseModel):
    uri: str
    entity_type: str
    entity_id: str
    commit_hash: str
    updated_at: float | None = None


class TagRead(BaseModel):
    name: str
    commit_hash: str
    updated_at: float | None = None


class BranchRead(BaseModel):
    name: str
    commit_hash: str
    updated_at: float | None = None


async def _get_nap_repo_or_404(
    repo_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> NapRepository:
    repo = (
        await session.exec(
            select(NapRepository)
            .join(ProjectRepositoryLink, ProjectRepositoryLink.repository_id == NapRepository.id)
            .join(Folder, Folder.id == ProjectRepositoryLink.folder_id)
            .where(NapRepository.id == repo_id, Folder.user_id == current_user.id)
            .distinct()
        )
    ).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@router.post(
    "/repositories",
    response_model=NapRepositoryRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new NAP repository for a project",
)
async def create_repository(
    body: CreateRepositoryRequest,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> NapRepositoryRead:
    """Create a new NAP repository for a project.

    For ``local`` repos, initialises a universe in the NAP storage layer.
    For ``remote`` repos, registers the remote URL as the source of truth.
    """
    # Verify the folder exists and belongs to the current user
    folder = (
        await session.exec(
            select(Folder).where(
                Folder.id == UUID(body.folder_id),
                Folder.user_id == current_user.id,
            )
        )
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    universe_name = body.name
    nap_uri = f"nap://{universe_name}"

    try:
        if body.repo_type == "local" and not await nap.universe_exists(universe_name):
            await nap.init_universe(universe_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Create the repository record
    db_repo = NapRepository(
        name=body.name,
        nap_uri=nap_uri,
        repo_type=body.repo_type,
        remote_url=body.remote_url,
        status="active",
    )
    session.add(db_repo)
    await session.flush()
    await session.refresh(db_repo)

    # Link it to the folder
    link = ProjectRepositoryLink(
        folder_id=UUID(body.folder_id),
        repository_id=db_repo.id,
    )
    session.add(link)
    await session.flush()

    logger.info(
        "Created NAP repository: id=%s name=%s type=%s folder=%s",
        db_repo.id,
        db_repo.name,
        body.repo_type,
        body.folder_id,
    )

    return NapRepositoryRead.model_validate(db_repo)


@router.get(
    "/repositories",
    response_model=list[NapRepositoryRead],
    summary="List all NAP repositories for the current user",
)
async def list_repositories(
    session: DbSession,
    current_user: CurrentActiveUser,
) -> list[NapRepositoryRead]:
    """List all NAP repositories owned by the current user."""
    repos = (
        await session.exec(
            select(NapRepository)
            .join(ProjectRepositoryLink, ProjectRepositoryLink.repository_id == NapRepository.id)
            .join(Folder, Folder.id == ProjectRepositoryLink.folder_id)
            .where(Folder.user_id == current_user.id)
            .distinct()
        )
    ).all()
    return [NapRepositoryRead.model_validate(r) for r in repos]


@router.get(
    "/repositories/recent",
    response_model=list[NapRepositoryRead],
    summary="List the user's most recently created NAP repositories",
)
async def recent_repositories(
    session: DbSession,
    current_user: CurrentActiveUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[NapRepositoryRead]:
    """Return recently created repositories for the current user.

    Returns the ``limit`` most recently created repositories ordered by
    ``created_at`` descending.
    """
    repos = (
        await session.exec(
            select(NapRepository)
            .join(ProjectRepositoryLink, ProjectRepositoryLink.repository_id == NapRepository.id)
            .join(Folder, Folder.id == ProjectRepositoryLink.folder_id)
            .where(Folder.user_id == current_user.id)
            .distinct()
            .order_by(NapRepository.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [NapRepositoryRead.model_validate(r) for r in repos]


@router.get(
    "/repositories/search",
    response_model=list[NapRepositoryRead],
    summary="Search the user's NAP repositories by name",
)
async def search_repositories(
    session: DbSession,
    current_user: CurrentActiveUser,
    q: Annotated[str, Query(min_length=1)] = "",
) -> list[NapRepositoryRead]:
    """Search the current user's repositories by name.

    Performs a case-insensitive partial match.
    """
    repos = (
        await session.exec(
            select(NapRepository)
            .join(ProjectRepositoryLink, ProjectRepositoryLink.repository_id == NapRepository.id)
            .join(Folder, Folder.id == ProjectRepositoryLink.folder_id)
            .where(Folder.user_id == current_user.id)
            .where(NapRepository.name.ilike(f"%{q}%"))
            .distinct()
            .order_by(NapRepository.created_at.desc())
        )
    ).all()
    return [NapRepositoryRead.model_validate(r) for r in repos]


@router.get(
    "/repositories/{repo_id}",
    response_model=NapRepositoryDetail,
    summary="Get repository details with entity listing",
)
async def get_repository(
    repo_id: UUID,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> NapRepositoryDetail:
    """Get repository details including entity summaries and recent commits."""
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)

    entities: list[EntitySummaryResponse] = []
    commits: list[CommitSummaryResponse] = []

    try:
        entity_summaries = await nap.list_entities(repo.name)
        entities = [
            EntitySummaryResponse(
                uri=e.uri,
                entity_type=e.entity_type,
                entity_id=e.entity_id,
                commit_hash=e.commit_hash,
                updated_at=e.updated_at,
            )
            for e in entity_summaries
        ]
        commit_summaries = await nap.list_commits(repo.name, max_count=20)
        commits = [
            CommitSummaryResponse(
                uri=c.uri,
                entity_type=c.entity_type,
                entity_id=c.entity_id,
                commit_hash=c.commit_hash,
                updated_at=c.updated_at,
            )
            for c in commit_summaries
        ]
    except ValueError as exc:
        logger.warning("Failed to list entities for repo %s: %s", repo.name, exc)

    detail = NapRepositoryDetail.model_validate(repo, from_attributes=True)
    detail.entities = [e.model_dump() for e in entities]
    detail.recent_commits = [c.model_dump() for c in commits]

    return detail


@router.post(
    "/repositories/{repo_id}/clone",
    summary="Clone a remote repository into the local NAP store",
)
async def clone_repository(
    repo_id: UUID,
    body: CloneRepositoryRequest,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> dict:
    """Clone a remote NAP universe into the local store.

    The remote URL becomes the source of truth. Local entities
    can be published back to the remote via the ``/push`` endpoint.
    """
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)

    if repo.repo_type != "remote":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only remote repositories can be cloned",
        )

    try:
        local_name = await nap.clone_from_remote(body.remote_url, repo.name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    repo.remote_url = body.remote_url
    repo.status = "active"
    session.add(repo)
    await session.flush()

    logger.info(
        "Cloned remote NAP repo: url=%s local=%s repo_id=%s",
        body.remote_url,
        local_name,
        repo_id,
    )

    return {"local_name": local_name, "status": "cloned"}


@router.post(
    "/repositories/{repo_id}/push",
    summary="Push local commits to a remote repository",
)
async def push_repository(
    repo_id: UUID,
    body: PushRepositoryRequest,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> dict:
    """Push local NAP commits to the remote repository.

    The remote repo is the source of truth. After pushing,
    the local repo's commit state is synced.
    """
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)

    try:
        count = await nap.push_to_remote(repo.name, body.remote_url)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    logger.info(
        "Pushed %d commits to remote NAP repo: url=%s repo_id=%s",
        count,
        body.remote_url,
        repo_id,
    )

    return {"commits_pushed": count, "status": "pushed"}


@router.get(
    "/repositories/{repo_id}/tags/recent",
    response_model=list[TagRead],
    summary="List the most recently updated tags for a repository",
)
async def recent_repository_tags(
    repo_id: UUID,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[TagRead]:
    """Return recently updated tags for a repository, most-recent first.

    Does not include the synthetic ``"latest"`` tag — the frontend should
    always offer that as a separate, always-present default option.
    """
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)
    try:
        tags = await nap.list_tags(repo.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [TagRead(name=t.name, commit_hash=t.commit_hash, updated_at=t.updated_at) for t in tags[:limit]]


@router.get(
    "/repositories/{repo_id}/tags/search",
    response_model=list[TagRead],
    summary="Search a repository's tags by name",
)
async def search_repository_tags(
    repo_id: UUID,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
    q: Annotated[str, Query(min_length=1)] = "",
) -> list[TagRead]:
    """Search a repository's tags by name (case-insensitive partial match)."""
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)
    try:
        tags = await nap.list_tags(repo.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    needle = q.lower()
    matches = [t for t in tags if needle in t.name.lower()]
    return [TagRead(name=t.name, commit_hash=t.commit_hash, updated_at=t.updated_at) for t in matches]


@router.get(
    "/repositories/{repo_id}/branches/recent",
    response_model=list[BranchRead],
    summary="List the most recently updated branches for a repository",
)
async def recent_repository_branches(
    repo_id: UUID,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[BranchRead]:
    """Return recently updated branches for a repository, most-recent first."""
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)
    try:
        branches = await nap.list_branches(repo.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return [BranchRead(name=b.name, commit_hash=b.commit_hash, updated_at=b.updated_at) for b in branches[:limit]]


@router.get(
    "/repositories/{repo_id}/branches/search",
    response_model=list[BranchRead],
    summary="Search a repository's branches by name",
)
async def search_repository_branches(
    repo_id: UUID,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
    q: Annotated[str, Query(min_length=1)] = "",
) -> list[BranchRead]:
    """Search a repository's branches by name (case-insensitive partial match)."""
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)
    try:
        branches = await nap.list_branches(repo.name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    needle = q.lower()
    matches = [b for b in branches if needle in b.name.lower()]
    return [BranchRead(name=b.name, commit_hash=b.commit_hash, updated_at=b.updated_at) for b in matches]


@router.get(
    "/repositories/by-folder/{folder_id}",
    response_model=NapRepositoryRead | None,
    summary="Get the NAP repository linked to a folder, if any",
)
async def get_repository_by_folder(
    folder_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> NapRepositoryRead | None:
    """Look up the repository linked to a given folder/project.

    Returns ``null`` if the folder has no linked repository (or doesn't
    belong to the current user).
    """
    repo = (
        await session.exec(
            select(NapRepository)
            .join(ProjectRepositoryLink, ProjectRepositoryLink.repository_id == NapRepository.id)
            .join(Folder, Folder.id == ProjectRepositoryLink.folder_id)
            .where(ProjectRepositoryLink.folder_id == folder_id)
            .where(Folder.user_id == current_user.id)
        )
    ).first()
    return NapRepositoryRead.model_validate(repo) if repo else None


@router.post(
    "/repositories/ensure-cloned/{folder_id}",
    summary="Ensure the repository linked to a folder is cloned locally",
)
async def ensure_repository_cloned(
    folder_id: UUID,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> dict:
    """Ensure the repository linked to a project folder is cloned to local storage.

    Checks if the repository exists locally and clones it if not.
    This is called when loading a flow to ensure the repository is available locally.
    """
    # Get the repository linked to this folder
    repo = (
        await session.exec(
            select(NapRepository)
            .join(ProjectRepositoryLink, ProjectRepositoryLink.repository_id == NapRepository.id)
            .join(Folder, Folder.id == ProjectRepositoryLink.folder_id)
            .where(ProjectRepositoryLink.folder_id == folder_id)
            .where(Folder.user_id == current_user.id)
        )
    ).first()

    if not repo:
        return {"status": "no_repository", "message": "No repository linked to this folder"}

    if repo.repo_type != "remote":
        return {"status": "not_remote", "message": "Repository is not remote, no cloning needed"}

    # Get the project repository link to find the pinned commit hash
    link = (
        await session.exec(
            select(ProjectRepositoryLink).where(
                ProjectRepositoryLink.folder_id == folder_id,
                ProjectRepositoryLink.repository_id == repo.id,
            )
        )
    ).first()

    if not link:
        return {"status": "no_link", "message": "No repository link found"}

    pinned_commit_hash = link.pinned_commit_hash

    # Check if the commit already exists locally
    if pinned_commit_hash:
        try:
            already_local = await nap.commit_exists_locally(repo.name, pinned_commit_hash)
            if already_local:
                logger.info(
                    "Repository already cloned locally: folder_id=%s repo_name=%s commit=%s",
                    folder_id,
                    repo.name,
                    pinned_commit_hash,
                )
                return {"status": "already_cloned", "message": "Repository already cloned locally"}
        except ValueError as exc:
            logger.warning(
                "Failed to check if commit exists locally: folder_id=%s repo_name=%s error=%s",
                folder_id,
                repo.name,
                exc,
            )

    # Clone the repository if not already local
    if repo.remote_url:
        try:
            if pinned_commit_hash:
                # Clone the specific commit
                await nap.clone_commit(repo.remote_url, repo.name, pinned_commit_hash)
                logger.info(
                    "Cloned repository commit locally: folder_id=%s repo_name=%s commit=%s",
                    folder_id,
                    repo.name,
                    pinned_commit_hash,
                )
                return {"status": "cloned", "message": "Repository cloned locally"}
            # Clone the entire repository
            local_name = await nap.clone_from_remote(repo.remote_url, repo.name)
            logger.info(
                "Cloned entire repository locally: folder_id=%s repo_name=%s local_name=%s",
                folder_id,
                repo.name,
                local_name,
            )
            return {"status": "cloned", "message": "Repository cloned locally"}
        except ValueError as exc:
            logger.error(
                "Failed to clone repository: folder_id=%s repo_name=%s error=%s",
                folder_id,
                repo.name,
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to clone repository: {exc!s}",
            ) from exc

    return {"status": "no_remote_url", "message": "Repository has no remote URL"}


@router.delete(
    "/repositories/{repo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a NAP repository",
)
async def delete_repository(
    repo_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> None:
    """Delete a NAP repository record.

    This does **not** delete the underlying NAP universe data
    from the storage layer — only the metadata record is removed.
    The universe can be re-attached by creating a new repo with
    the same name.
    """
    repo = await _get_nap_repo_or_404(repo_id, session, current_user)

    # Delete link rows first to avoid FK violation
    links = (
        await session.exec(select(ProjectRepositoryLink).where(ProjectRepositoryLink.repository_id == repo.id))
    ).all()
    for link in links:
        await session.delete(link)

    await session.delete(repo)
    await session.flush()

    logger.info("Deleted NAP repository: id=%s name=%s", repo_id, repo.name)


# ═══════════════════════════════════════════════════════════════════════
# Combined project creation (folder + NapRepository + lore-server universe)
# ═══════════════════════════════════════════════════════════════════════


def _slugify(name: str) -> str:
    """Convert a project name into a filesystem-safe NAP universe slug."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9-]", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-")


class RepositorySelection(BaseModel):
    mode: Literal["existing", "new"]
    """Whether to link to an existing repository or create a new one."""

    repository_id: str | None = None
    """The ID of an existing repository (required when mode='existing')."""

    name: str | None = None
    """The name for a new repository (required when mode='new')."""

    tag: str = "latest"
    """Tag to pin the project to when mode='existing'. Defaults to the
    sentinel ``"latest"``, which always resolves to the repository's most
    recent commit. Ignored when mode='new' (a brand-new repository has no
    tags or commits yet)."""

    branch: str | None = None
    """Branch to pin the project to when mode='existing'. If specified,
    takes precedence over tag. Defaults to None for tag-based pinning.
    Ignored when mode='new'."""


class CreateProjectWithRepoRequest(BaseModel):
    name: str
    """The project name (also used to derive the NAP universe slug)."""

    description: str = ""
    """Optional project description."""

    repository: RepositorySelection
    """Repository selection: link to existing or create new."""


class CreateProjectWithRepoResponse(BaseModel):
    folder: FolderRead
    """The newly created Portals project folder."""

    repository: NapRepositoryRead
    """The NapRepository record linking to the lore-server universe."""

    mode: str = "created"
    """``"created"`` if a new lore-server universe was initialised,
    ``"existing"`` if a universe with the same slug already existed."""


@router.post(
    "/projects",
    response_model=CreateProjectWithRepoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project with a NAP repository (combined)",
)
async def create_project_with_repo(
    body: CreateProjectWithRepoRequest,
    nap: NapDep,
    session: DbSession,
    current_user: CurrentActiveUser,
) -> CreateProjectWithRepoResponse:
    """Create a Portals project and optional repository in one transaction.

    Creates a Folder, a NapRepository record (if ``mode="new"``),
    and conditionally initialises a lore-server universe.

    Supports two modes:
    - ``mode="existing"``: Link to an existing repository by ID
    - ``mode="new"``: Create a new repository with the given name
    """
    # 1. Create the folder
    folder = Folder(
        name=body.name,
        description=body.description,
        user_id=current_user.id,
    )
    session.add(folder)
    await session.flush()
    await session.refresh(folder)

    # 2. Handle repository selection based on mode
    if body.repository.mode == "existing":
        # Link to existing repository
        if not body.repository.repository_id:
            await session.delete(folder)
            await session.flush()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="repository_id is required when mode='existing'",
            )

        existing_repo = await session.get(NapRepository, UUID(body.repository.repository_id))
        if not existing_repo:
            await session.delete(folder)
            await session.flush()
            raise HTTPException(status_code=404, detail="Repository not found")

        tag = body.repository.tag or "latest"
        branch = body.repository.branch

        # Resolve the requested branch or tag to a concrete commit hash
        # Branch takes precedence over tag if both are specified
        try:
            if branch:
                pinned_commit_hash = await nap.resolve_branch(existing_repo.name, branch)
            else:
                pinned_commit_hash = await nap.resolve_tag(existing_repo.name, tag)
        except ValueError as exc:
            await session.delete(folder)
            await session.flush()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        # Materialize that commit locally if needed
        if existing_repo.repo_type == "remote" and pinned_commit_hash:
            already_local = await nap.commit_exists_locally(existing_repo.name, pinned_commit_hash)
            if not already_local:
                try:
                    await nap.clone_commit(
                        existing_repo.remote_url,
                        existing_repo.name,
                        pinned_commit_hash,
                    )
                except ValueError as exc:
                    await session.delete(folder)
                    await session.flush()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=str(exc),
                    ) from exc

        # Create the link — multiple projects can share one repository
        link = ProjectRepositoryLink(
            folder_id=folder.id,
            repository_id=existing_repo.id,
            tag=tag if not branch else "latest",  # Default to latest if branch is specified
            branch=branch,
            pinned_commit_hash=pinned_commit_hash,
        )
        session.add(link)
        await session.flush()

        db_repo = existing_repo
        mode = "existing"

    elif body.repository.mode == "new":
        # Create new repository
        if not body.repository.name:
            await session.delete(folder)
            await session.flush()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="repository name is required when mode='new'",
            )

        repo_name = _slugify(body.repository.name)
        if not repo_name:
            await session.delete(folder)
            await session.flush()
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Repository name must contain at least one alphanumeric character",
            )

        # Check whether the lore-server universe already exists
        mode = "existing"
        try:
            if not await nap.universe_exists(repo_name):
                await nap.init_universe(repo_name)
                mode = "created"
        except ValueError as exc:
            await session.delete(folder)
            await session.flush()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        # Create the NapRepository record
        db_repo = NapRepository(
            name=repo_name,
            nap_uri=f"nap://{repo_name}",
            repo_type="remote",
            status="active",
        )
        session.add(db_repo)
        await session.flush()
        await session.refresh(db_repo)

        # Link the new repository to the folder
        link = ProjectRepositoryLink(
            folder_id=folder.id,
            repository_id=db_repo.id,
        )
        session.add(link)
        await session.flush()

    else:
        await session.delete(folder)
        await session.flush()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid repository mode: {body.repository.mode}",
        )

    logger.info(
        "Created NAP project: folder=%s repo=%s name=%s mode=%s",
        folder.id,
        db_repo.id,
        db_repo.name,
        mode,
    )

    return CreateProjectWithRepoResponse(
        folder=FolderRead.model_validate(folder),
        repository=NapRepositoryRead.model_validate(db_repo),
        mode=mode,
    )
