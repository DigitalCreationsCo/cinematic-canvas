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
