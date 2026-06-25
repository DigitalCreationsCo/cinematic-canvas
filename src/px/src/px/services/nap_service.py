"""Production-grade NAP read service.

Provides the canonical read abstraction over the NAP universe repository.
All narrative entity reads flow through this service. Components must not
directly use ``nap_sdk`` functions.

Architecture
------------
    Component
        -> BaseStateAwareComponent
            -> NapService       <-- you are here
                -> nap_sdk
                    -> NAP Universe Repository

Usage
-----
    from px.services.nap_service import get_nap_read_service, NapService

    service = NapService(base_path="/path/to/repos")
    service.initialize("my-universe")

    world = service.get_world_manifest()
    characters = service.get_entities("character")
    entity = service.get_entity("nap://my-universe/character/hagrid")
    members = service.query(uri, "references.members")
"""

from __future__ import annotations

from typing import Any

import nap_sdk

from px.log.logger import logger

# ────────────────────────────────────────────────────────────────
# Structured exceptions
# ────────────────────────────────────────────────────────────────


class NapError(Exception):
    """Base exception for all NAP operations."""


class EntityNotFoundError(NapError):
    """Raised when an entity URI does not exist in the universe."""


class InvalidUriError(NapError):
    """Raised when a URI string is malformed or cannot be parsed."""


class RepresentationNotFoundError(NapError):
    """Raised when a representation key is not found on an entity."""


class UniverseNotFoundError(NapError):
    """Raised when the configured universe does not exist or cannot be opened."""


# ────────────────────────────────────────────────────────────────
# NapService — canonical read abstraction
# ────────────────────────────────────────────────────────────────


class NapService:
    """Canonical read abstraction over a NAP universe repository.

    All narrative entity reads should flow through this service.
    Components must not directly invoke ``nap_sdk`` functions.

    The service is **not** a singleton — it accepts a *base_path*
    and *universe* at initialisation so that different universes
    can be served by different instances.  In most application
    contexts a single instance (obtained via ``get_nap_read_service``)
    is sufficient.

    Thread-safety: nap_sdk operations are file-system bound and
    internally synchronised.  This class adds no additional locks.
    """

    def __init__(self, base_path: str | None = None) -> None:
        self._base_path: str | None = base_path
        self._universe: str | None = None
        self._initialized: bool = False
        # URI → manifest cache (FIFO eviction via dict insertion-order pop)
        self._manifest_cache: dict[str, dict[str, Any]] = {}
        self._cache_max: int = 1024

    # ── Lifecycle ───────────────────────────────────────────────

    def initialize(self, universe: str) -> None:
        """Open a universe repository for reads.

        Args:
            universe: The universe name to operate on
                      (e.g. ``"my-project"``, ``"harrypotter"``).

        Raises:
            UniverseNotFoundError: If the universe cannot be opened.
        """
        if self._initialized:
            if self._universe == universe:
                logger.debug("NapService already initialized for universe", universe=universe)
                return
            logger.warning(
                "Re-initializing NapService with a different universe",
                previous=self._universe,
                new=universe,
            )
            self._manifest_cache.clear()
        try:
            nap_sdk.repo_open(universe, base_path=self._base_path)
            self._universe = universe
            self._initialized = True
            logger.info(
                "NapService initialized",
                universe=universe,
                base_path=self._base_path,
            )
        except Exception as exc:
            raise UniverseNotFoundError(
                f"Universe '{universe}' not found at base_path={self._base_path}: {exc}"
            ) from exc

    @property
    def universe(self) -> str | None:
        """Return the configured universe name, or ``None``."""
        return self._universe

    # ── URI helpers ─────────────────────────────────────────────

    def parse_uri(self, uri: str) -> dict[str, str]:
        """Parse a NAP URI into its components.

        Returns:
            Dict with keys ``universe``, ``entity_type``, ``entity_id``,
            and optionally ``fragment``.

        Raises:
            InvalidUriError: If the URI is malformed.
        """
        try:
            return nap_sdk.parse_uri(uri)
        except Exception as exc:
            raise InvalidUriError(f"Invalid NAP URI '{uri}': {exc}") from exc

    def format_uri(
        self,
        universe: str,
        entity_type: str,
        entity_id: str,
    ) -> str:
        """Format a NAP URI from its components."""
        return nap_sdk.uri_format(universe, entity_type, entity_id)

    # ── Entity resolution ───────────────────────────────────────

    def get_universe_name(self) -> str:
        """Return the configured universe name.

        Raises:
            UniverseNotFoundError: If ``initialize()`` has not been called.
        """
        if not self._universe:
            raise UniverseNotFoundError("No universe configured. Call initialize() first.")
        return self._universe

    def get_world_manifest(self) -> dict[str, Any]:
        """Locate and resolve the universe world entity.

        The world entity is discovered from the universe repository;
        no hardcoded identifiers are used.

        Returns:
            The world entity manifest dict.

        Raises:
            EntityNotFoundError: If no world entity exists.
        """
        worlds = self.get_entities("world")
        if not worlds:
            universe = self.get_universe_name()
            raise EntityNotFoundError(f"No world entity found in universe '{universe}'.")
        return worlds[0]

    def get_entity(self, uri: str) -> dict[str, Any]:
        """Resolve a single entity manifest by URI.

        Results are cached for the lifetime of the service instance
        (or until ``invalidate_cache`` is called).

        Args:
            uri: Fully qualified NAP URI
                 (e.g. ``nap://my-universe/character/hagrid``).

        Returns:
            Normalized manifest dict with ``id``, ``type``, and ``uri``
            always present.

        Raises:
            InvalidUriError: If the URI is malformed.
            EntityNotFoundError: If the entity does not exist.
        """
        # ── Cache check ──────────────────────────────────────────
        cached = self._manifest_cache.get(uri)
        if cached is not None:
            logger.debug("Cache hit for entity", uri=uri)
            return cached

        # ── Parse ────────────────────────────────────────────────
        try:
            parsed = self.parse_uri(uri)
        except InvalidUriError:
            raise

        universe = parsed["universe"]
        entity_type = parsed["entity_type"]
        entity_id = parsed["entity_id"]

        # ── Resolve ──────────────────────────────────────────────
        try:
            manifest = nap_sdk.repo_read_manifest(
                universe,
                entity_type,
                entity_id,
                base_path=self._base_path,
            )
        except Exception as exc:
            raise EntityNotFoundError(f"Entity not found at '{uri}' in universe '{universe}': {exc}") from exc

        if not manifest:
            raise EntityNotFoundError(f"Entity not found: '{uri}'")

        # Normalise — ensure stable fields
        manifest.setdefault("id", entity_id)
        manifest.setdefault("type", entity_type)
        manifest.setdefault("uri", uri)

        # ── Cache ────────────────────────────────────────────────
        self._cache_manifest(uri, manifest)

        logger.debug(
            "Resolved entity",
            uri=uri,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        return manifest

    def get_entities(self, entity_type: str) -> list[dict[str, Any]]:
        """List all entities of a given type with fully hydrated manifests.

        Internally uses ``repo_list_entities`` and resolves each manifest.
        Entities that fail to resolve are skipped (with a warning).

        Args:
            entity_type: One of ``character``, ``location``, ``prop``,
                         ``group``, ``scene``, ``world``, etc.

        Returns:
            List of normalised entity manifests.
        """
        universe = self.get_universe_name()

        try:
            entity_ids = nap_sdk.repo_list_entities(
                universe,
                entity_type,
                base_path=self._base_path,
            )
        except Exception as exc:
            logger.error(
                "Failed to list entities in universe",
                universe=universe,
                entity_type=entity_type,
                error=str(exc),
            )
            return []

        if not entity_ids:
            return []

        manifests: list[dict[str, Any]] = []
        for entity_id in entity_ids:
            uri = self.format_uri(universe, entity_type, entity_id)
            try:
                manifests.append(self.get_entity(uri))
            except (EntityNotFoundError, InvalidUriError) as exc:
                logger.warning(
                    "Skipping unresolvable entity while listing",
                    entity_id=entity_id,
                    entity_type=entity_type,
                    error=str(exc),
                )

        logger.debug(
            "Listed entities",
            entity_type=entity_type,
            resolved=len(manifests),
            total=len(entity_ids),
        )
        return manifests

    def resolve_many(self, uris: list[str]) -> list[dict[str, Any]]:
        """Efficiently resolve multiple entity manifests.

        Each resolved URI is cached, so repeated calls with overlapping
        URI sets benefit from the LRU cache.

        Args:
            uris: List of NAP URIs to resolve.

        Returns:
            List of normalised manifests in the same order as *uris*.
            Missing or unresolvable URIs are omitted with a warning.
        """
        manifests: list[dict[str, Any]] = []
        for uri in uris:
            try:
                manifests.append(self.get_entity(uri))
            except (EntityNotFoundError, InvalidUriError) as exc:
                logger.warning(
                    "Skipping unresolvable URI in resolve_many",
                    uri=uri,
                    error=str(exc),
                )
        return manifests

    # ── Query / sub-path access ─────────────────────────────────

    def query(self, uri: str, path: str) -> Any:
        """Access a subtree within an entity manifest by dot-separated path.

        Uses ``nap_sdk.resolve_query`` for efficient path access.

        Example::

            service.query("nap://project/group/team", "references.members")

        Args:
            uri: NAP URI to query.
            path: Dot-separated path (e.g. ``"references.members"``).

        Returns:
            The value at the given path, or ``None`` if the path
            does not exist or the query fails.
        """
        try:
            return nap_sdk.resolve_query(
                uri,
                path,
                repo_path=self._base_path,
            )
        except Exception as exc:
            logger.warning(
                "Query failed",
                uri=uri,
                path=path,
                error=str(exc),
            )
            return None

    # ── Representations ─────────────────────────────────────────

    def get_representation(
        self,
        uri: str,
        representation_key: str,
    ) -> dict[str, Any] | None:
        """Get a specific representation from an entity manifest.

        Representations are stored in the manifest under the
        ``representations`` key.

        Args:
            uri: NAP URI of the entity.
            representation_key: Key such as ``portrait``, ``sheet``,
                                ``avatar``, ``voice``, ``video``,
                                ``reference``.

        Returns:
            The representation dict, or ``None`` if the key is not
            present or the entity cannot be resolved.
        """
        try:
            manifest = self.get_entity(uri)
        except (EntityNotFoundError, InvalidUriError):
            return None

        representations = manifest.get("representations", {})
        if isinstance(representations, dict):
            return representations.get(representation_key)
        return None

    # ── References ──────────────────────────────────────────────

    def get_entity_references(self, uri: str) -> dict[str, Any]:
        """Get the ``references`` section of an entity manifest.

        References contain linked entities (members of a group,
        characters in a scene, etc.).

        Args:
            uri: NAP URI of the entity.

        Returns:
            References dict, or an empty dict if the entity has no
            references or cannot be resolved.
        """
        try:
            manifest = self.get_entity(uri)
        except (EntityNotFoundError, InvalidUriError):
            return {}
        return manifest.get("references", {})

    # ── Existence check ─────────────────────────────────────────

    def entity_exists(self, uri: str) -> bool:
        """Check whether an entity exists in the universe.

        Args:
            uri: NAP URI to check.

        Returns:
            ``True`` if the entity can be resolved, ``False`` otherwise.
        """
        try:
            self.get_entity(uri)
            return True
        except (EntityNotFoundError, InvalidUriError):
            return False

    # ── Story context (bounded working set) ─────────────────────

    def get_project_story_context(
        self,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        """Build a bounded story context suitable for LLM prompts.

        Loads the world entity and all relevant entity types from the
        universe.  This method deliberately does **not** load the
        entire universe — only the top-level entity lists that are
        needed for storyboard generation.

        Args:
            project_id: Optional project identifier (reserved for future
                        scoping; currently unused).

        Returns:
            Dict with keys:
                ``world``       — world manifest (or empty dict)
                ``characters``  — list of character manifests
                ``locations``   — list of location manifests
                ``props``       — list of prop manifests
                ``groups``      — list of group manifests
                ``scenes``      — list of scene manifests
        """
        universe = self.get_universe_name()

        context: dict[str, Any] = {
            "world": {},
            "characters": [],
            "locations": [],
            "props": [],
            "groups": [],
            "scenes": [],
        }

        # World
        try:
            context["world"] = self.get_world_manifest()
        except Exception as exc:
            logger.warning(
                "No world entity found in universe",
                universe=universe,
                error=str(exc),
            )

        # All entity types
        for entity_type in ("character", "location", "prop", "group", "scene"):
            plural = f"{entity_type}s"
            try:
                context[plural] = self.get_entities(entity_type)
            except Exception as exc:
                logger.warning(
                    "Failed to load entities for story context",
                    entity_type=entity_type,
                    error=str(exc),
                )

        logger.info(
            "Built story context",
            universe=universe,
            characters=len(context["characters"]),
            locations=len(context["locations"]),
            props=len(context["props"]),
            groups=len(context["groups"]),
            scenes=len(context["scenes"]),
        )
        return context

    # ── Cache management ────────────────────────────────────────

    def invalidate_cache(self, uri: str | None = None) -> None:
        """Invalidate the manifest cache.

        Args:
            uri: If provided, only the entry for *uri* is removed.
                 If ``None``, the entire cache is cleared.
        """
        if uri:
            self._manifest_cache.pop(uri, None)
            logger.debug("Invalidated cache entry", uri=uri)
        else:
            self._manifest_cache.clear()
            logger.debug("Invalidated entire entity cache")

    # ── Internal helpers ────────────────────────────────────────

    def _cache_manifest(self, uri: str, manifest: dict[str, Any]) -> None:
        """Store a manifest in the LRU-ish cache.

        When the cache exceeds ``_cache_max`` entries the oldest
        entry is evicted (simple FIFO eviction).
        """
        if len(self._manifest_cache) >= self._cache_max:
            # FIFO eviction — remove the first (oldest) key
            try:
                self._manifest_cache.pop(next(iter(self._manifest_cache)))
            except StopIteration:
                pass
        self._manifest_cache[uri] = manifest


# ────────────────────────────────────────────────────────────────
# Singleton accessor
# ────────────────────────────────────────────────────────────────

_nap_service_instance: NapService | None = None


def get_nap_read_service() -> NapService | None:
    """Return the global ``NapService`` instance.

    Returns ``None`` if the service has not been initialised.
    This is the canonical accessor for components that need
    read-only NAP access.
    """
    return _nap_service_instance


def initialize_nap_read_service(
    universe: str,
    base_path: str | None = None,
) -> NapService:
    """Initialize and register the global ``NapService``.

    Creates a new service instance, opens the universe, and
    registers it as the global singleton.

    Args:
        universe: NAP universe name.
        base_path: Optional filesystem path to the NAP repository root.

    Returns:
        The newly created ``NapService`` instance.

    Raises:
        UniverseNotFoundError: If the universe cannot be opened.
    """
    global _nap_service_instance  # noqa: PLW0603
    service = NapService(base_path=base_path)
    service.initialize(universe)
    _nap_service_instance = service
    return service
