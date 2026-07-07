"""In-memory ``NapRepository`` implementation for development & testing.

This mock stores all manifests in a dict keyed by ``{uri}@{commit}``.
It implements the full NAP merge semantics (missing ≠ null, path-union
traversal, identity immutability) so the FastAPI + frontend integration
can be developed and tested before the real ``nap-sdk`` bindings exist.
"""

from __future__ import annotations

import copy
import hashlib
import json
import time
from pathlib import Path
from typing import Any

from portals.services.nap.protocol import (
    BranchSummary,
    CommitRef,
    CommitSummary,
    Conflict,
    DiffChange,
    EntitySummary,
    ManifestRef,
    MergePreview,
    TagSummary,
)


def _normalize_path(path: str) -> list[str]:
    """Split a dot-separated JSON path into a list of keys.

    Example: ``"physical_traits.height"`` → ``["physical_traits", "height"]``
    """
    return path.split(".")


def _get_by_path(root: dict, path: str) -> Any:
    """Deep-dot access into a nested dict."""
    parts = _normalize_path(path)
    current = root
    for part in parts:
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _set_by_path(root: dict, path: str, value: Any) -> None:
    """Deep-dot set into a nested dict (creates intermediate dicts)."""
    parts = _normalize_path(path)
    current = root
    for part in parts[:-1]:
        if part not in current or not isinstance(current[part], dict):
            current[part] = {}
        current = current[part]
    current[parts[-1]] = value


def _del_by_path(root: dict, path: str) -> None:
    """Deep-dot delete from a nested dict."""
    parts = _normalize_path(path)
    current = root
    for part in parts[:-1]:
        if not isinstance(current, dict) or part not in current:
            return
        current = current[part]
    current.pop(parts[-1], None)


# ── Fields that must never be overwritten by a merge (identity fields) ──
_IMMUTABLE_FIELDS = frozenset({"uri", "id", "type", "created_at"})


def _collect_leaf_paths(
    manifest: dict,
    prefix: str = "",
) -> set[str]:
    """Recursively collect all leaf (non-dict) paths in a manifest.

    Returns a set of dot-separated paths.
    """
    paths: set[str] = set()
    for key, value in manifest.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            paths |= _collect_leaf_paths(value, path)
        else:
            paths.add(path)
    return paths


def _normalize_manifest(
    manifest: dict[str, Any],
    base: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Normalize a manifest before merge.

    * Fills missing SDL-required fields from *base* (if provided).
    * Ensures identity fields are present.
    """
    normalized = copy.deepcopy(manifest)
    if base is not None:
        # Fill SDL-required fields that are missing in proposed
        for key, value in base.items():
            if key not in normalized and not key.startswith("_"):
                normalized[key] = copy.deepcopy(value)
    return normalized


def _hash_manifest(manifest: dict) -> str:
    """Deterministic hash of a manifest for commit identity."""
    raw = json.dumps(manifest, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:12]


class MockNapRepository:
    """In-memory mock that implements the ``NapRepository`` protocol.

    All data is stored in a flat dictionary:

    .. code-block:: python

        _store: dict[str, dict[str, Any]] = {
            "nap://proj/char/a@{commit_hash}": { ... manifest ... },
            "nap://proj/char/a@{other_hash}": { ... manifest ... },
        }

    The ``HEAD`` of each URI tracks the latest commit.
    """

    def __init__(self, assets_dir: str | Path | None = None) -> None:
        self._store: dict[str, dict[str, Any]] = {}
        self._heads: dict[str, str] = {}  # uri → latest commit hash
        self._commits: dict[str, list[str]] = {}  # uri → ordered list of commit hashes
        self._assets: dict[str, bytes] = {}
        self._assets_dir = Path(assets_dir) if assets_dir else Path("/tmp/nap-assets")
        self._universes: dict[str, set[str]] = {}  # universe → set of URIs
        self._tags: dict[str, dict[str, TagSummary]] = {}  # universe → {tag name → TagSummary}
        self._branches: dict[str, dict[str, BranchSummary]] = {}  # universe → {branch name → BranchSummary}
        self._local_commits: dict[str, set[str]] = {}  # universe → set of locally-cloned commit hashes

    # ── Protocol implementation ──────────────────────────────────────────

    def create(
        self,
        uri: str,
        manifest: dict[str, Any],
        message: str = "",
    ) -> str:
        if uri in self._heads:
            msg = f"Entity '{uri}' already exists"
            raise ValueError(msg)

        manifest.setdefault("uri", uri)
        manifest.setdefault("created_at", time.time())
        universe = uri.split("/")[2] if uri.startswith("nap://") else None
        if universe and universe not in self._universes:
            self._universes[universe] = set()
        if universe:
            self._universes[universe].add(uri)
        return self._publish(uri, manifest, message)

    def resolve(self, uri: str, commit: str) -> dict[str, Any]:
        if commit == "HEAD":
            head = self._heads.get(uri)
            if head is None:
                msg = f"Entity '{uri}' not found"
                raise ValueError(msg)
            commit = head

        key = self._store_key(uri, commit)
        manifest = self._store.get(key)
        if manifest is None:
            msg = f"Commit '{commit}' not found for URI '{uri}'"
            raise ValueError(msg)
        return copy.deepcopy(manifest)

    def diff(
        self,
        from_ref: CommitRef | ManifestRef,
        to_ref: CommitRef | ManifestRef,
    ) -> list[DiffChange]:
        from_manifest = self._resolve_ref(from_ref)
        to_manifest = self._resolve_ref(to_ref)

        all_paths = _collect_leaf_paths(from_manifest) | _collect_leaf_paths(to_manifest)
        changes: list[DiffChange] = []
        sorted_paths = sorted(all_paths)

        for path in sorted_paths:
            before = _get_by_path(from_manifest, path)
            after = _get_by_path(to_manifest, path)

            if before == after:
                continue

            if before is None and after is not None:
                changes.append(DiffChange(path=path, kind="added", before=None, after=after))
            elif before is not None and after is None:
                changes.append(DiffChange(path=path, kind="removed", before=before, after=None))
            else:
                changes.append(DiffChange(path=path, kind="modified", before=before, after=after))

        return changes

    def merge(
        self,
        base: dict[str, Any],
        current: dict[str, Any],
        proposed: dict[str, Any],
    ) -> MergePreview:
        base_norm = _normalize_manifest(base)
        current_norm = _normalize_manifest(current, base_norm)
        proposed_norm = _normalize_manifest(proposed, base_norm)

        merged = copy.deepcopy(base_norm)
        conflicts: list[Conflict] = []

        # Collect all paths from all three manifests
        all_paths = (
            _collect_leaf_paths(base_norm) | _collect_leaf_paths(current_norm) | _collect_leaf_paths(proposed_norm)
        )

        for path in sorted(all_paths):
            base_val = _get_by_path(base_norm, path)
            current_val = _get_by_path(current_norm, path)
            proposed_val = _get_by_path(proposed_norm, path)

            # Handle identity fields
            top_key = path.split(".")[0]
            if top_key in _IMMUTABLE_FIELDS:
                # Keep identity from base — never changed
                if base_val is not None:
                    _set_by_path(merged, path, base_val)
                continue

            # base == proposed → no change intended → use current
            if base_val == proposed_val:
                if current_val is not None:
                    _set_by_path(merged, path, current_val)
                else:
                    _del_by_path(merged, path)

            # base == current → no concurrent change → accept proposed
            elif base_val == current_val:
                if proposed_val is not None:
                    _set_by_path(merged, path, proposed_val)
                else:
                    # Explicit null = deletion per merge semantics
                    _del_by_path(merged, path)

            # All three differ → conflict
            else:
                conflicts.append(
                    Conflict(
                        path=path,
                        base=copy.deepcopy(base_val),
                        current=copy.deepcopy(current_val),
                        proposed=copy.deepcopy(proposed_val),
                    )
                )

        return MergePreview(merged_manifest=merged, conflicts=conflicts)

    def publish(
        self,
        uri: str,
        manifest: dict[str, Any],
        message: str = "",
    ) -> str:
        return self._publish(uri, manifest, message)

    def ingest_media(self, data: bytes, fmt: str) -> str:
        raw_hash = hashlib.sha256(data).hexdigest()
        content_hash = f"sha256:{raw_hash}"

        # Store in assets directory with content hash as filename
        extension = _mime_to_extension(fmt)
        filename = f"{raw_hash}{extension}"
        self._assets_dir.mkdir(parents=True, exist_ok=True)
        (self._assets_dir / filename).write_bytes(data)

        return content_hash

    # ── Universe/repository-level operations ────────────────────────────

    def list_universes(self) -> list[str]:
        return sorted(self._universes.keys())

    def universe_exists(self, name: str) -> bool:
        return name in self._universes

    def init_universe(self, name: str) -> None:
        if name in self._universes:
            msg = f"Universe '{name}' already exists"
            raise ValueError(msg)
        self._universes[name] = set()
        # Initialize default "main" branch for new universes
        self._branches.setdefault(name, {})["main"] = BranchSummary(
            name="main",
            commit_hash="",
            updated_at=time.time_ns(),
        )

    def list_entities(self, universe: str) -> list[EntitySummary]:
        prefix = f"nap://{universe}/"
        uris: set[str] = set()
        for key in self._store:
            if key.startswith(prefix):
                uri = key.split("@")[0]
                uris.add(uri)
        result: list[EntitySummary] = []
        for uri in sorted(uris):
            head = self._heads.get(uri)
            manifest = self._store.get(self._store_key(uri, head)) if head else {}
            entity_type = manifest.get("type", "unknown")
            entity_id = manifest.get("id", uri.rsplit("/", 1)[-1])
            result.append(
                EntitySummary(
                    uri=uri,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    commit_hash=head,
                    updated_at=manifest.get("updated_at"),
                )
            )
        return result

    def list_commits(self, universe: str, max_count: int = 50) -> list[CommitSummary]:
        prefix = f"nap://{universe}/"
        all_commits: list[CommitSummary] = []
        for uri, commit_hashes in self._commits.items():
            if not uri.startswith(prefix):
                continue
            entity_type = "unknown"
            entity_id = uri.rsplit("/", 1)[-1]
            for commit_hash in commit_hashes:
                key = self._store_key(uri, commit_hash)
                manifest = self._store.get(key, {})
                entity_type = manifest.get("type", entity_type)
                all_commits.append(
                    CommitSummary(
                        uri=uri,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        commit_hash=commit_hash,
                        updated_at=manifest.get("updated_at"),
                    )
                )
        all_commits.sort(key=lambda c: c.updated_at or 0, reverse=True)
        return all_commits[:max_count]

    def clone_from_remote(self, remote_url: str, local_name: str) -> str:
        if local_name in self._universes:
            msg = f"Local universe '{local_name}' already exists"
            raise ValueError(msg)
        self._universes[local_name] = set()
        return local_name

    def push_to_remote(self, universe: str, remote_url: str) -> int:
        if universe not in self._universes:
            msg = f"Universe '{universe}' not found"
            raise ValueError(msg)
        return 0

    # ── Tags ─────────────────────────────────────────────────────────────

    def list_tags(self, universe: str) -> list[TagSummary]:
        tags = self._tags.get(universe, {})
        return sorted(tags.values(), key=lambda t: t.updated_at or 0, reverse=True)

    def create_tag(
        self,
        universe: str,
        name: str,
        commit_hash: str | None = None,
    ) -> TagSummary:
        if universe not in self._universes:
            msg = f"Universe '{universe}' not found"
            raise ValueError(msg)
        if name == "latest":
            msg = "'latest' is a reserved tag name and cannot be created"
            raise ValueError(msg)

        resolved_commit = commit_hash or self._latest_commit_for_universe(universe)
        if resolved_commit is None:
            msg = f"Universe '{universe}' has no commits to tag"
            raise ValueError(msg)

        tag = TagSummary(name=name, commit_hash=resolved_commit, updated_at=time.time_ns())
        self._tags.setdefault(universe, {})[name] = tag
        return tag

    def resolve_tag(self, universe: str, tag: str) -> str:
        if universe not in self._universes:
            msg = f"Universe '{universe}' not found"
            raise ValueError(msg)

        if tag == "latest":
            commit = self._latest_commit_for_universe(universe)
            if commit is None:
                msg = f"Universe '{universe}' has no commits yet"
                raise ValueError(msg)
            return commit

        tag_obj = self._tags.get(universe, {}).get(tag)
        if tag_obj is None:
            msg = f"Tag '{tag}' not found in universe '{universe}'"
            raise ValueError(msg)
        return tag_obj.commit_hash

    def list_branches(self, universe: str) -> list[BranchSummary]:
        """List all branches in a universe, most-recently-updated first."""
        branches = self._branches.get(universe, {})
        return sorted(branches.values(), key=lambda b: b.updated_at or 0, reverse=True)

    def resolve_branch(self, universe: str, branch: str) -> str:
        """Resolve a branch name to a concrete commit hash."""
        if universe not in self._universes:
            msg = f"Universe '{universe}' not found"
            raise ValueError(msg)

        branch_obj = self._branches.get(universe, {}).get(branch)
        if branch_obj is None:
            msg = f"Branch '{branch}' not found in universe '{universe}'"
            raise ValueError(msg)
        return branch_obj.commit_hash

    def clone_commit(
        self,
        remote_url: str,
        local_name: str,
        commit_hash: str,
    ) -> str:
        # Idempotent & additive, unlike clone_from_remote: repeated calls
        # for the same universe accumulate distinct local commits instead
        # of raising on an already-existing local universe.
        if local_name not in self._universes:
            self._universes[local_name] = set()
        self._local_commits.setdefault(local_name, set()).add(commit_hash)
        return local_name

    def commit_exists_locally(self, universe: str, commit_hash: str) -> bool:
        return commit_hash in self._local_commits.get(universe, set())

    def _latest_commit_for_universe(self, universe: str) -> str | None:
        """Return the most recently published commit across all
        entities in *universe* — the universe's synthetic "tip".
        """
        commits = self.list_commits(universe, max_count=1)
        return commits[0].commit_hash if commits else None

    # ── Internal helpers ─────────────────────────────────────────────────

    def _publish(self, uri: str, manifest: dict[str, Any], message: str = "") -> str:
        timestamp = time.time_ns()
        manifest["updated_at"] = timestamp
        commit_hash = _hash_manifest(manifest)

        key = self._store_key(uri, commit_hash)
        self._store[key] = copy.deepcopy(manifest)
        self._heads[uri] = commit_hash

        if uri not in self._commits:
            self._commits[uri] = []
        self._commits[uri].append(commit_hash)

        return commit_hash

    def _store_key(self, uri: str, commit: str) -> str:
        return f"{uri}@{commit}"

    def _resolve_ref(self, ref: CommitRef | ManifestRef) -> dict[str, Any]:
        if isinstance(ref, CommitRef):
            # Need URI context for commit resolution
            msg = "CommitRef requires a URI context. Use the two-argument form of resolve() or pass ManifestRef."
            raise ValueError(msg)
        return copy.deepcopy(ref.manifest)

    def _resolve_manifest(self, uri: str, commit_or_ref: CommitRef | ManifestRef) -> dict[str, Any]:
        if isinstance(commit_or_ref, CommitRef):
            return self.resolve(uri, commit_or_ref.commit)
        return copy.deepcopy(commit_or_ref.manifest)


def _mime_to_extension(mime: str) -> str:
    """Map common MIME types to file extensions."""
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "audio/wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/ogg": ".ogg",
        "video/mp4": ".mp4",
        "text/plain": ".txt",
        "application/json": ".json",
    }
    # If it doesn't look like a MIME type, treat as extension directly
    if "/" not in mime:
        return f".{mime.lstrip('.')}"
    return mapping.get(mime, ".bin")
