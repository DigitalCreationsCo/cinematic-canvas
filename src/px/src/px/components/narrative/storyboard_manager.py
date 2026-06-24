"""Storyboard Manager — merge generated storyboard data and build NAP context.

Gen3 Architecture
-----------------
StoryboardManager is the bridge between NAP narrative state and storyboard
generation.  It is responsible for:

1. **Building a bounded storyboard context** from NAP manifests (world,
   characters, locations, props, groups, scenes).  The context is deliberately
   **not** the full universe — only top-level entity lists are loaded so that
   large universes (1000+ entities) do not overflow LLM prompt windows.

2. **Merging** generated storyboard content into a project's live storyboard
   (the Folder's ``storyboard`` JSONB field).  Merge semantics match the
   TypeScript implementation (``src/shared/services/storyboard-manager.ts``).

Merge semantics (copy-modify-write):
  - Entities matched by ``id`` are updated in-place (insertion order preserved).
  - Entities absent from ``current`` are appended (net-new).
  - No entity is ever duplicated, even under repeated calls with the same data.
  - Scenes are always re-sorted by ``sceneIndex`` in the output.
  - Metadata is shallow-merged; incoming values win on key conflicts.
  - Inputs are never mutated (copy-modify-write).

Usage
-----
    from px.components.narrative.storyboard_manager import StoryboardManager

    # Build bounded context from NAP
    context = StoryboardManager.build_storyboard_context(nap_service)
    world = context["world"]
    characters = context["characters"]

    # Merge generated content
    merged = StoryboardManager.merge_into_project(current, generated)
"""

from __future__ import annotations

from typing import Any

from px.log.logger import logger

# Type alias for storyboard context
StoryboardContext = dict[str, Any]


class StoryboardManager:
    """Bridge between NAP narrative state and storyboard generation.

    Stateless — a single instance is safe to reuse across all executions.
    """

    # ======================================================================
    # CONTEXT CONSTRUCTION (NapService → bounded working set)
    # ======================================================================

    @staticmethod
    def build_storyboard_context(
        nap_service: Any,
        project_id: str | None = None,
    ) -> StoryboardContext:
        """Build a bounded storyboard context from the NAP universe.

        Loads the world entity and all relevant entity types.  Only
        top-level entity lists are loaded — the full universe is not
        traversed.

        Args:
            nap_service: A ``NapService`` instance (from
                         ``px.services.nap_service``).
            project_id: Optional project ID (reserved for future scoping).

        Returns:
            Dict with keys ``world``, ``characters``, ``locations``,
            ``props``, ``groups``, ``scenes``.
        """
        universe = nap_service.get_universe_name()
        logger.info(
            "Building storyboard context from NAP universe",
            universe=universe,
        )

        context: StoryboardContext = {
            "world": {},
            "characters": [],
            "locations": [],
            "props": [],
            "groups": [],
            "scenes": [],
        }

        # World
        try:
            context["world"] = nap_service.get_world_manifest()
        except Exception as exc:
            logger.warning(
                "No world entity found in universe",
                universe=universe,
                error=str(exc),
            )

        # Entity types
        for entity_type in ("character", "location", "prop", "group", "scene"):
            plural = f"{entity_type}s"
            try:
                context[plural] = nap_service.get_entities(entity_type)
                logger.debug(
                    "Loaded entities for storyboard context",
                    entity_type=entity_type,
                    count=len(context[plural]),
                )
            except Exception as exc:
                logger.warning(
                    "Failed to load entities for storyboard context",
                    entity_type=entity_type,
                    error=str(exc),
                )

        logger.info(
            "Storyboard context built",
            universe=universe,
            characters=len(context["characters"]),
            locations=len(context["locations"]),
            props=len(context["props"]),
            groups=len(context["groups"]),
            scenes=len(context["scenes"]),
        )
        return context

    @staticmethod
    def collect_story_entities(
        nap_service: Any,
        entity_type: str,
    ) -> list[dict[str, Any]]:
        """Collect all entities of a given type from the NAP universe.

        Args:
            nap_service: A ``NapService`` instance.
            entity_type: ``"character"``, ``"location"``, ``"prop"``, etc.

        Returns:
            List of entity manifests.
        """
        try:
            return nap_service.get_entities(entity_type)
        except Exception as exc:
            logger.error(
                "Failed to collect story entities",
                entity_type=entity_type,
                error=str(exc),
            )
            return []

    @staticmethod
    def collect_story_groups(nap_service: Any) -> list[dict[str, Any]]:
        """Collect all groups from the NAP universe.

        Groups are first-class NAP entities that may reference characters,
        locations, props, scenes, or other groups.
        """
        return StoryboardManager.collect_story_entities(nap_service, "group")

    @staticmethod
    def collect_story_locations(nap_service: Any) -> list[dict[str, Any]]:
        """Collect all locations from the NAP universe."""
        return StoryboardManager.collect_story_entities(nap_service, "location")

    @staticmethod
    def collect_story_props(nap_service: Any) -> list[dict[str, Any]]:
        """Collect all props from the NAP universe."""
        return StoryboardManager.collect_story_entities(nap_service, "prop")

    @staticmethod
    def collect_story_characters(nap_service: Any) -> list[dict[str, Any]]:
        """Collect all characters from the NAP universe."""
        return StoryboardManager.collect_story_entities(nap_service, "character")

    @staticmethod
    def resolve_group_members(
        nap_service: Any,
        group_manifest: dict[str, Any],
        max_depth: int = 5,
    ) -> list[dict[str, Any]]:
        """Resolve all members of a group, recursing into nested groups.

        Performs cycle detection to avoid infinite recursion on cyclic
        group references.

        Args:
            nap_service: A ``NapService`` instance.
            group_manifest: The group entity manifest.
            max_depth: Maximum nesting depth (default 5).

        Returns:
            List of resolved member manifests (flat, all nesting levels).
        """
        references = group_manifest.get("references", {})
        members_uri = references.get("members", [])

        if not isinstance(members_uri, list):
            return []

        return StoryboardManager._resolve_member_uris(
            nap_service,
            members_uri,
            depth=0,
            max_depth=max_depth,
            visited=None,
        )

    # ======================================================================
    # MERGE (storyboard content → Folder storyboard JSONB)
    # ======================================================================

    @staticmethod
    def merge_into_project(
        current_storyboard: dict[str, Any],
        generated: dict[str, Any],
    ) -> dict[str, Any]:
        """Merge *generated* storyboard content into the *current* storyboard.

        Parameters
        ----------
        current_storyboard:
            The existing storyboard object.  May be empty or partial.
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

    # ======================================================================
    # MERGE PRIMITIVES
    # ======================================================================

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

    # ======================================================================
    # INTERNAL HELPERS
    # ======================================================================

    @staticmethod
    def _as_list(value: Any) -> list[Any]:
        """Coerce *value* to a list, returning ``[]`` for ``None``."""
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return [value]

    @staticmethod
    def _resolve_member_uris(
        nap_service: Any,
        uris: list[str],
        depth: int,
        max_depth: int,
        visited: set[str] | None,
    ) -> list[dict[str, Any]]:
        """Recursively resolve a list of member URIs into manifests.

        Performs cycle detection to prevent infinite recursion on cyclic
        group references.

        Args:
            nap_service: A ``NapService`` instance.
            uris: List of NAP URIs to resolve.
            depth: Current recursion depth (starts at 0).
            max_depth: Maximum allowed nesting depth.
            visited: Set of already-visited URIs (for cycle detection).

        Returns:
            Flat list of resolved entity manifests.
        """
        if visited is None:
            visited = set()

        if depth >= max_depth:
            logger.warning(
                "Max group nesting depth reached",
                depth=depth,
                max_depth=max_depth,
                uris=uris,
            )
            return []

        members: list[dict[str, Any]] = []
        for uri in uris:
            if not isinstance(uri, str):
                continue

            # Cycle detection
            if uri in visited:
                logger.debug("Cycle detected in group references, skipping", uri=uri)
                continue
            visited.add(uri)

            try:
                manifest = nap_service.get_entity(uri)
            except Exception as exc:
                logger.warning(
                    "Failed to resolve group member",
                    uri=uri,
                    error=str(exc),
                )
                continue

            members.append(manifest)

            # If this member is itself a group, recurse
            entity_type = manifest.get("type", "")
            if entity_type == "group":
                refs = manifest.get("references", {})
                children = refs.get("members", [])
                if isinstance(children, list):
                    nested = StoryboardManager._resolve_member_uris(
                        nap_service,
                        children,
                        depth=depth + 1,
                        max_depth=max_depth,
                        visited=visited,
                    )
                    members.extend(nested)

        return members
