"""NapRepository protocol and shared types for nap-core integration.

This module defines the abstract interface that Portals uses to communicate
with the Narrative Addressing Protocol storage layer. The protocol is
implemented by ``MockNapRepository`` (in-memory, for development/testing)
and will later be backed by ``nap_sdk`` bindings.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

# ── Data types ─────────────────────────────────────────────────────────


@dataclass
class Conflict:
    """A single conflicting field from a 3-way merge."""

    path: str
    """Dot-separated JSON pointer to the conflicting field
    (e.g. ``"physical_traits.height"``)."""

    base: Any
    """Value in the *base* manifest (the common ancestor commit)."""

    current: Any
    """Value in the *current* manifest (``HEAD`` at merge time)."""

    proposed: Any
    """Value in the *proposed* manifest (the user's draft)."""


@dataclass
class MergePreview:
    """Result of a 3-way merge operation.

    If ``conflicts`` is empty the merge succeeded and ``merged_manifest``
    is ready to be published.  If conflicts are present the caller must
    resolve each conflict and call ``publish()`` with the complete resolved
    manifest.
    """

    merged_manifest: dict[str, Any]
    """The auto-merged manifest.  For non-conflicting paths this IS the
    final value.  Conflicting paths contain the *base* value and must be
    resolved by the caller before publishing."""

    conflicts: list[Conflict] = field(default_factory=list)
    """Zero or more fields that could not be auto-merged."""


@dataclass
class DiffChange:
    """A semantic change between two manifests.

    Unlike raw RFC 6902 JSON Patch operations, this type expresses
    human- and agent-interpretable semantic changes.
    """

    path: str
    """Dot-separated JSON pointer to the changed field."""

    kind: str  # "added" | "modified" | "removed"
    """The nature of the change. One of ``"added"``, ``"modified"``,
    or ``"removed"``."""

    before: Any = None
    """The value before the change. ``None`` for additions."""

    after: Any = None
    """The value after the change. ``None`` for removals."""


# ── Diff operand union ─────────────────────────────────────────────────


@dataclass
class CommitRef:
    """Reference a commit by hash."""

    commit: str


@dataclass
class ManifestRef:
    """Reference an inline manifest."""

    manifest: dict[str, Any]


@dataclass
class EntitySummary:
    """Summary of a single entity in a universe listing."""

    uri: str
    entity_type: str
    entity_id: str
    commit_hash: str | None = None
    updated_at: float | None = None


@dataclass
class CommitSummary:
    """Summary of a single commit in a universe."""

    uri: str
    entity_type: str
    entity_id: str
    commit_hash: str
    updated_at: float | None = None


@dataclass
class TagSummary:
    """Summary of a single named tag in a universe.

    A tag is a named pointer to a specific commit within a universe,
    used to pin projects to a stable point in the universe's history.
    The sentinel tag name ``"latest"`` is never stored — it is resolved
    dynamically to the universe's most recent commit by
    :meth:`NapRepository.resolve_tag`.
    """

    name: str
    commit_hash: str
    updated_at: float | None = None


@dataclass
class BranchSummary:
    """Summary of a single branch in a universe.

    A branch is a named pointer to a mutable commit within a universe,
    used to pin projects to a specific branch for ongoing development.
    The default branch name is typically ``"main"``.
    """

    name: str
    commit_hash: str
    updated_at: float | None = None


# ── Repository protocol ────────────────────────────────────────────────


@runtime_checkable
class NapRepository(Protocol):
    """Interface to the Narrative Addressing Protocol storage layer.

    All methods are **synchronous** and **potentially CPU-bound** (they
    may involve hashing, Git I/O, or structured merge computation).
    Callers at the FastAPI layer **must** wrap calls in
    ``fastapi.concurrency.run_in_threadpool()`` to avoid blocking the
    async event loop (see Gotcha #4).
    """

    def create(
        self,
        uri: str,
        manifest: dict[str, Any],
        message: str = "",
    ) -> str:
        """Create a new entity at *uri* with the given *manifest*.

        Args:
            uri: Fully-qualified nap URI
                (e.g. ``nap://my-project/character/abc-123``).
            manifest: Initial entity manifest.
            message: Optional commit message.

        Returns:
            The SHA commit hash of the newly created entity.
        """
        ...

    def resolve(
        self,
        uri: str,
        commit: str,
    ) -> dict[str, Any]:
        """Resolve an entity's manifest at a specific commit.

        Args:
            uri: The nap URI to resolve.
            commit: A commit hash or symbolic reference
                (e.g. ``"HEAD"``, ``"abc123"``).

        Returns:
            The complete manifest dict.

        Raises:
            ValueError: If *uri* does not exist or *commit* is unknown.
        """
        ...

    def diff(
        self,
        from_ref: CommitRef | ManifestRef,
        to_ref: CommitRef | ManifestRef,
    ) -> list[DiffChange]:
        """Compute a semantic diff between two manifests.

        Accepts three operand forms::

            # commit → commit
            diff(CommitRef("abc"), CommitRef("def"))

            # commit → inline manifest (publish preview)
            diff(CommitRef("abc"), ManifestRef({...}))

            # manifest → manifest (agent review)
            diff(ManifestRef({...}), ManifestRef({...}))

        Args:
            from_ref: Left-hand operand.
            to_ref: Right-hand operand.

        Returns:
            Ordered list of semantic changes.
        """
        ...

    def merge(
        self,
        base: dict[str, Any],
        current: dict[str, Any],
        proposed: dict[str, Any],
    ) -> MergePreview:
        """Perform a structured 3-way merge.

        The merge follows NAP Merge Semantics Spec v2:

        * ``missing ≠ null`` — omitted keys mean "no change", explicit
          ``null`` means "delete this field".
        * Manifests are **normalized** before comparison (SDL-required
          fields are filled, identity fields are stabilised).
        * Path-union traversal — only leaf values that differ between
          *base* and *proposed* (or *base* and *current*) are compared.
        * Immutable identity fields (e.g. ``uri``, ``id``) are never
          overwritten.

        Args:
            base: The common ancestor manifest.
            current: The ``HEAD`` manifest at merge time.
            proposed: The user's proposed draft manifest.

        Returns:
            A ``MergePreview`` containing the merged manifest and any
            unresolved conflicts.
        """
        ...

    def publish(
        self,
        uri: str,
        manifest: dict[str, Any],
        message: str = "",
    ) -> str:
        """Persist a manifest as a new commit.

        Args:
            uri: The nap URI to publish to.
            manifest: The complete manifest to persist.
            message: Optional commit message.

        Returns:
            The SHA commit hash of the new commit.
        """
        ...

    def ingest_media(
        self,
        data: bytes,
        fmt: str,
    ) -> str:
        """Store raw media bytes into the content-addressed asset store.

        The resulting hash is a content-derived SHA-256 prefixed with
        ``"sha256:"`` (e.g. ``"sha256:abc123def..."``).

        Args:
            data: Raw file bytes.
            fmt: MIME type or file extension hint
                (e.g. ``"image/png"``, ``"audio/wav"``).

        Returns:
            Content hash in the form ``"sha256:<hex>"``.
        """
        ...

    # ── Repository / universe-level operations ─────────────────────────

    def list_universes(self) -> list[str]:
        """Return all registered universe names.

        A "universe" maps 1:1 to a project's NAP namespace
        (e.g. ``"my-project"`` in ``nap://my-project/character/...``).
        """
        ...

    def universe_exists(self, name: str) -> bool:
        """Check whether a universe exists in this repository."""
        ...

    def init_universe(self, name: str) -> None:
        """Register a new universe in this repository.

        Args:
            name: Universe name (typically the project UUID or slug).

        Raises:
            ValueError: If the universe already exists.
        """
        ...

    def list_entities(self, universe: str) -> list[EntitySummary]:
        """List all entity summaries in a universe."""
        ...

    def list_commits(self, universe: str, max_count: int = 50) -> list[CommitSummary]:
        """List recent commits across all entities in a universe."""
        ...

    def clone_from_remote(self, remote_url: str, local_name: str) -> str:
        """Clone a remote universe into the local repository.

        Args:
            remote_url: URL or path to the remote universe.
            local_name: Name for the local copy.

        Returns:
            The local universe name.

        Raises:
            ValueError: If the remote is unreachable or the name
                        conflicts with an existing universe.
        """
        ...

    def push_to_remote(self, universe: str, remote_url: str) -> int:
        """Push local commits to a remote universe.

        Args:
            universe: Local universe name.
            remote_url: Target remote URL.

        Returns:
            Number of commits pushed.
        """
        ...

    # ── Tags ─────────────────────────────────────────────────────────────

    def list_tags(self, universe: str) -> list[TagSummary]:
        """List all named tags in a universe, most-recently-updated first.

        Does **not** include the synthetic ``"latest"`` tag — that is
        always resolved dynamically via :meth:`resolve_tag` and is never
        a stored, listable tag.
        """
        ...

    def create_tag(
        self,
        universe: str,
        name: str,
        commit_hash: str | None = None,
    ) -> TagSummary:
        """Create or move a named tag to point at *commit_hash*.

        Args:
            universe: Universe the tag belongs to.
            name: Tag name. Must not be the reserved word ``"latest"``.
            commit_hash: Commit to point the tag at. If omitted, the tag
                is pointed at the universe's current tip commit.

        Returns:
            The created/updated ``TagSummary``.

        Raises:
            ValueError: If *universe* doesn't exist, *name* is reserved,
                or there is no commit to tag when *commit_hash* is omitted.
        """
        ...

    def resolve_tag(self, universe: str, tag: str) -> str:
        """Resolve a tag name to a concrete commit hash.

        The sentinel value ``"latest"`` always resolves to the
        universe's current tip commit, regardless of whether a stored
        tag with that name exists.

        Args:
            universe: Universe to resolve the tag within.
            tag: A stored tag name, or the sentinel ``"latest"``.

        Returns:
            The resolved commit hash.

        Raises:
            ValueError: If *universe* doesn't exist, or *tag* is not
                ``"latest"`` and no matching stored tag is found, or the
                universe has no commits yet.
        """
        ...

    def list_branches(self, universe: str) -> list[BranchSummary]:
        """List all branches in a universe, most-recently-updated first.

        Returns the list of available branches for a universe.
        """
        ...

    def resolve_branch(self, universe: str, branch: str) -> str:
        """Resolve a branch name to a concrete commit hash.

        Args:
            universe: Universe to resolve the branch within.
            branch: A branch name (e.g. ``"main"``).

        Returns:
            The resolved commit hash (the tip of the branch).

        Raises:
            ValueError: If *universe* doesn't exist, or *branch* is not found.
        """
        ...

    def clone_commit(
        self,
        remote_url: str,
        local_name: str,
        commit_hash: str,
    ) -> str:
        """Materialize a specific commit of a remote universe locally.

        Unlike :meth:`clone_from_remote` (a one-time, whole-universe
        clone), this method is **idempotent** and **additive**: calling
        it repeatedly with different ``commit_hash`` values accumulates
        multiple locally-available commits of the same universe rather
        than overwriting a single local copy. Calling it again with a
        commit hash that is already local is a no-op.

        Args:
            remote_url: URL of the remote universe.
            local_name: Local universe name (same for every commit of
                a given universe).
            commit_hash: The specific commit to materialize locally.

        Returns:
            The local universe name.

        Raises:
            ValueError: If the remote or commit is unreachable.
        """
        ...

    def commit_exists_locally(self, universe: str, commit_hash: str) -> bool:
        """Check whether a specific commit of *universe* is already
        materialized on local storage.
        """
        ...
