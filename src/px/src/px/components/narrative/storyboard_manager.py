"""Storyboard Manager — merge generated storyboard data into project folders.

Provides the Python equivalent of the TypeScript ``StoryboardManager``
(``src/shared/services/storyboard-manager.ts``), using copy-modify-write
semantics to ensure JSONB fields are properly merged without accidental
property exclusion.

Merge semantics (mirrors the TypeScript implementation):
  - Entities matched by ``id`` are updated in-place (insertion order preserved).
  - Entities absent from ``current`` are appended (net-new).
  - No entity is ever duplicated, even under repeated calls with the same data.
  - Scenes are always re-sorted by ``sceneIndex`` in the output.
  - Metadata is shallow-merged; incoming values win on key conflicts.
  - Inputs are never mutated (copy-modify-write).
"""

from __future__ import annotations

from typing import Any


class StoryboardManager:
    """Merges generated storyboard content into a project's live storyboard.

    Stateless — a single instance is safe to reuse across all executions.
    """

    # ------------------------------------------------------------------
    # PUBLIC API
    # ------------------------------------------------------------------

    @staticmethod
    def merge_into_project(
        current_storyboard: dict[str, Any],
        generated: dict[str, Any],
    ) -> dict[str, Any]:
        """Merge *generated* storyboard content into the *current* storyboard.

        Parameters
        ----------
        current_storyboard:
            The existing storyboard from ``folder.storyboard`` (a ``LiveStoryboard``
            shaped dict).  May be empty or partial.
        generated:
            The newly generated storyboard output.  Typically contains
            ``metadata``, ``characters``, ``locations``, ``props``, and/or
            ``scenes`` as top-level keys.

        Returns:
        -------
        A **new** storyboard dict with merged content.  Input dicts are
        **never mutated**.
        """
        # Copy — never mutate the caller's dict
        merged: dict[str, Any] = dict(current_storyboard)

        # ── Metadata: shallow merge ────────────────────────────────────
        current_meta: dict = current_storyboard.get("metadata") or {}
        new_meta: dict = generated.get("metadata") or {}
        merged["metadata"] = {**current_meta, **new_meta}

        # ── Entity arrays: upsert by ``id`` ────────────────────────────
        for key in ("characters", "locations", "props", "scenes"):
            if key in generated or key in current_storyboard:
                merged[key] = StoryboardManager._upsert_entities(
                    StoryboardManager._as_list(current_storyboard.get(key)),
                    StoryboardManager._as_list(generated.get(key)),
                )

        # ── Scenes: always re-sort by ``sceneIndex`` ───────────────────
        if "scenes" in merged:
            merged["scenes"] = sorted(
                merged["scenes"],
                key=lambda s: s.get("sceneIndex", 0) if isinstance(s, dict) else 0,
            )

        return merged

    # ------------------------------------------------------------------
    # MERGE PRIMITIVE
    # ------------------------------------------------------------------

    @staticmethod
    def _upsert_entities(existing: list[Any], incoming: list[Any]) -> list[Any]:
        """Upsert *incoming* items into *existing*, matched by ``"id"``.

        Pass 1 — walk *existing* in order.  If an incoming item shares the
        same ``id``, it replaces the existing version (field update).
        Otherwise the existing item is kept unchanged (no-op for unaffected
        entities).

        Pass 2 — append items from *incoming* whose ``id`` was not present
        in *existing* at all (net-new entities).

        Result is always duplicate-free.  Existing insertion order is
        preserved for non-new items; new items are appended in the order
        they appear in *incoming*.
        """
        if not incoming:
            return list(existing)
        if not existing:
            return list(incoming)

        # Build lookup: id → incoming item
        incoming_by_id: dict[str, Any] = {}
        for item in incoming:
            if isinstance(item, dict) and "id" in item:
                incoming_by_id[item["id"]] = item

        if not incoming_by_id:
            # No items have an ``id`` key — just concatenate
            return [*existing, *incoming]

        seen_ids: set[str] = set()
        result: list[Any] = []

        # Pass 1: update matching, preserve non-matching
        for item in existing:
            if isinstance(item, dict) and item.get("id") in incoming_by_id:
                result.append(incoming_by_id[item["id"]])
                seen_ids.add(item["id"])
            else:
                result.append(item)

        # Pass 2: append net-new
        for item in incoming:
            if isinstance(item, dict) and item.get("id") not in seen_ids:
                result.append(item)
                if isinstance(item, dict) and "id" in item:
                    seen_ids.add(item["id"])

        return result

    # ------------------------------------------------------------------
    # INTERNAL HELPERS
    # ------------------------------------------------------------------

    @staticmethod
    def _as_list(value: Any) -> list[Any]:
        """Coerce *value* to a list, returning ``[]`` for ``None``."""
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return [value]
