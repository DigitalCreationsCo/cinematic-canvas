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
    CommitRef,
    Conflict,
    DiffChange,
    ManifestRef,
    MergePreview,
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
        self._commits: dict[str, str] = {}  # uri → ordered list of commit hashes
        self._assets: dict[str, bytes] = {}
        self._assets_dir = Path(assets_dir) if assets_dir else Path("/tmp/nap-assets")

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
