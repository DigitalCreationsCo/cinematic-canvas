"""nap-core integration service.

Provides:

* ``NapRepository`` protocol — abstract interface for nap-sdk bindings
* ``MockNapRepository`` — in-memory implementation for dev/test
* ``NapService`` — thread-safe async service wrapping all repository calls
  in ``run_in_threadpool()`` to prevent blocking the FastAPI event loop.
* ``get_nap_repository()`` — global accessor (same pattern as
  ``get_db_service()``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from portals.services.nap.mock_repository import MockNapRepository
from portals.services.nap.protocol import (
    CommitRef,
    Conflict,
    DiffChange,
    ManifestRef,
    MergePreview,
    NapRepository,
)

if TYPE_CHECKING:
    from pathlib import Path

# Global singleton (initialized during FastAPI lifespan)
_nap_service: NapService | None = None


class NapService:
    """Async wrapper around a ``NapRepository``.

    All repository calls are dispatched via
    ``fastapi.concurrency.run_in_threadpool()`` to avoid blocking the
    async event loop during CPU-bound operations (hashing, merge, Git I/O).
    """

    def __init__(self, repo: NapRepository) -> None:
        self._repo = repo

    # ── Entity lifecycle ─────────────────────────────────────────────────

    async def create_entity(
        self,
        entity_type: str,
        project_id: str,
        initial_data: dict | None = None,
    ) -> EntityCreateResult:
        """Create a new narrative entity.

        Generates a stable nap URI, builds the initial manifest, and
        persists it through the repository.

        This is the **single entry point** for entity creation used by
        human users, AI agents, and workflow graph execution — all
        routes go through this method.
        """
        from uuid import uuid4

        from fastapi.concurrency import run_in_threadpool

        entity_id = str(uuid4())
        uri = f"nap://{project_id}/{entity_type}/{entity_id}"

        manifest = {
            "id": entity_id,
            "type": entity_type,
            **(initial_data or {}),
        }

        commit_hash = await run_in_threadpool(
            self._repo.create,
            uri,
            manifest,
            message=f"Create {entity_type} {entity_id}",
        )

        return EntityCreateResult(
            uri=uri,
            commit_hash=commit_hash,
            entity_id=entity_id,
        )

    async def resolve(
        self,
        uri: str,
        commit: str = "HEAD",
    ) -> dict:
        """Resolve an entity manifest at a specific commit."""
        from fastapi.concurrency import run_in_threadpool

        return await run_in_threadpool(self._repo.resolve, uri, commit)

    async def publish(
        self,
        uri: str,
        base_commit_hash: str,
        resolved_manifest: dict,
        message: str = "Portals Publish",
    ) -> PublishResult:
        """Publish a resolved manifest.

        Validates that ``HEAD`` has not moved since the caller's
        merge preview was generated (optimistic locking).  If it has,
        returns a ``409 Conflict`` instructing the caller to re-merge.

        Returns:
            ``PublishResult`` with either a ``commit_hash`` (success) or
            ``conflicts`` (stale HEAD).
        """
        from fastapi.concurrency import run_in_threadpool

        # 1. Check HEAD hasn't moved
        current = await run_in_threadpool(self._repo.resolve, uri, "HEAD")

        # 2. Resolve the baselines
        try:
            base = await run_in_threadpool(self._repo.resolve, uri, base_commit_hash)
        except ValueError:
            # base_commit_hash not found — the caller is working from
            # a commit that no longer exists in the repository.
            return PublishResult(
                conflicts=[
                    Conflict(
                        path="",
                        base=None,
                        current=current,
                        proposed=resolved_manifest,
                    )
                ],
            )

        # 3. If HEAD moved, run a fresh merge to detect conflicts
        head_hash = self._resolve_commit_for(current, uri)
        if head_hash != base_commit_hash:
            # HEAD has changed — re-merge to check for new conflicts
            preview = await run_in_threadpool(
                self._repo.merge,
                base,
                current,
                resolved_manifest,
            )
            if preview.conflicts:
                return PublishResult(conflicts=preview.conflicts)
            # Merge succeeded with latest HEAD — publish the fresh result
            new_hash = await run_in_threadpool(
                self._repo.publish,
                uri,
                preview.merged_manifest,
                message,
            )
            return PublishResult(commit_hash=new_hash)

        # 4. HEAD hasn't moved — publish directly
        new_hash = await run_in_threadpool(
            self._repo.publish,
            uri,
            resolved_manifest,
            message,
        )
        return PublishResult(commit_hash=new_hash)

    async def merge(
        self,
        uri: str,
        base_commit_hash: str,
        proposed_manifest: dict,
    ) -> MergePreview:
        """Generate a merge preview without persisting.

        Used to produce the ``MergePreview`` that the frontend displays
        for conflict resolution or publishes non-conflicting results.
        """
        from fastapi.concurrency import run_in_threadpool

        current = await run_in_threadpool(self._repo.resolve, uri, "HEAD")
        base = await run_in_threadpool(self._repo.resolve, uri, base_commit_hash)

        preview = await run_in_threadpool(
            self._repo.merge,
            base,
            current,
            proposed_manifest,
        )
        return preview

    async def diff(
        self,
        uri: str | None,
        from_ref: CommitRef | ManifestRef,
        to_ref: CommitRef | ManifestRef,
    ) -> list[DiffChange]:
        """Compute a semantic diff between two manifest references."""
        from fastapi.concurrency import run_in_threadpool

        # Resolve manifest references that need a URI context
        resolved_from = await self._resolve_ref(from_ref, uri)
        resolved_to = await self._resolve_ref(to_ref, uri)

        from_m = ManifestRef(manifest=resolved_from)
        to_m = ManifestRef(manifest=resolved_to)

        return await run_in_threadpool(self._repo.diff, from_m, to_m)

    async def ingest_media(
        self,
        data: bytes,
        fmt: str,
    ) -> str:
        """Store media and return content hash."""
        from fastapi.concurrency import run_in_threadpool

        return await run_in_threadpool(self._repo.ingest_media, data, fmt)

    # ── Internal helpers ─────────────────────────────────────────────────

    async def _resolve_ref(
        self,
        ref: CommitRef | ManifestRef,
        uri: str | None,
    ) -> dict:
        from fastapi.concurrency import run_in_threadpool

        if isinstance(ref, ManifestRef):
            return ref.manifest
        if uri is None:
            msg = "uri is required when diffing commit references"
            raise ValueError(msg)
        return await run_in_threadpool(self._repo.resolve, uri, ref.commit)

    @staticmethod
    def _resolve_commit_for(manifest: dict, uri: str) -> str | None:
        """Extract the commit hash from a resolved manifest if available."""
        # The mock stores the commit differently. For real nap-sdk
        # integration, this will be metadata on the resolved response.
        return manifest.get("_commit_hash")


# ── Result types ─────────────────────────────────────────────────────────


class EntityCreateResult:
    """Result of a successful entity creation."""

    def __init__(
        self,
        uri: str,
        commit_hash: str,
        entity_id: str,
    ) -> None:
        self.uri = uri
        self.commit_hash = commit_hash
        self.entity_id = entity_id


class PublishResult:
    """Result of a publish attempt.

    Exactly one of ``commit_hash`` or ``conflicts`` will be set.
    """

    def __init__(
        self,
        commit_hash: str | None = None,
        conflicts: list[Conflict] | None = None,
    ) -> None:
        self.commit_hash = commit_hash
        self.conflicts = conflicts or []
        self._is_success = commit_hash is not None

    @property
    def is_success(self) -> bool:
        return self._is_success


# ── Public API ──────────────────────────────────────────────────────────


def get_nap_service() -> NapService | None:
    """Return the global ``NapService`` instance.

    Returns ``None`` if the service has not been initialised (should
    not happen in normal operation — the service is set up during the
    FastAPI lifespan).
    """
    return _nap_service


def initialize_nap_service(repo: NapRepository) -> NapService:
    """Initialize and register the global nap service.

    Called during the FastAPI ``lifespan`` startup.
    """
    global _nap_service  # noqa: PLW0603
    service = NapService(repo=repo)
    _nap_service = service
    return service


# Re-export protocol types for convenience
__all__ = [
    "CommitRef",
    "Conflict",
    "DiffChange",
    "EntityCreateResult",
    "ManifestRef",
    "MergePreview",
    "MockNapRepository",
    "NapRepository",
    "NapService",
    "PublishResult",
    "get_nap_service",
    "initialize_nap_service",
]
