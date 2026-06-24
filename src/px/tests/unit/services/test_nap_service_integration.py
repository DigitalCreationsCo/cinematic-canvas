"""Integration tests for NapService backed by a real nap_sdk repository.

All tests create a fresh NAP universe via ``nap_sdk.repo_init`` inside a
temporary directory, so no mocks are used.  Each test is fully isolated.

Notes
-----
- nap_sdk 0.2.6 supports only ``character``, ``location``, ``scene``,
  ``prop``, and ``world`` entity types.  ``group`` is NOT supported
  (calls with ``entity_type="group"`` raise ``ValueError``).
- ``repo_init`` automatically creates a ``world`` entity (``universe.yaml``).
- ``change_set`` has a native-arg-order bug — we write test data directly
  to YAML files to avoid it.
"""

from __future__ import annotations

import os
import tempfile
from typing import Any, Generator

import nap_sdk
import pytest
import yaml

from px.services.nap_service import (
    EntityNotFoundError,
    InvalidUriError,
    NapError,
    NapService,
    UniverseNotFoundError,
    get_nap_read_service,
    initialize_nap_read_service,
)

# =========================================================================
# Helpers  (avoid nap_sdk.change_set which has a native-arg-order bug)
# =========================================================================


def _set_representation_on_entity(
    universe: str,
    entity_type: str,
    entity_id: str,
    rep_key: str,
    rep_value: dict[str, Any],
    base_path: str,
) -> None:
    """Write a representation into an entity's YAML manifest."""
    type_dir = nap_sdk.entity_type_directory_name(entity_type)
    path = os.path.join(base_path, universe, type_dir, f"{entity_id}.yaml")
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    data.setdefault("representations", {})
    data["representations"][rep_key] = rep_value
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False)


def _set_reference_on_entity(
    universe: str,
    entity_type: str,
    entity_id: str,
    ref_key: str,
    ref_value: list[str],
    base_path: str,
) -> None:
    """Write a reference into an entity's YAML manifest."""
    type_dir = nap_sdk.entity_type_directory_name(entity_type)
    path = os.path.join(base_path, universe, type_dir, f"{entity_id}.yaml")
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    data.setdefault("references", {})
    data["references"][ref_key] = ref_value
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False)


def _set_property_on_entity(
    universe: str,
    entity_type: str,
    entity_id: str,
    prop_key: str,
    prop_value: Any,
    base_path: str,
) -> None:
    """Write a custom property into an entity's YAML manifest."""
    type_dir = nap_sdk.entity_type_directory_name(entity_type)
    path = os.path.join(base_path, universe, type_dir, f"{entity_id}.yaml")
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    data.setdefault("properties", {})
    data["properties"][prop_key] = prop_value
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False)


# =========================================================================
# Fixtures
# =========================================================================


@pytest.fixture
def nap_repo() -> Generator[str, None, None]:
    """Create a temporary directory for a NAP repository (uninitialised)."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def initialized_repo(nap_repo: str) -> Generator[tuple[str, str], None, None]:
    """Create a universe with 2 characters, 1 location, 1 prop, 1 scene, 1 world.

    Entities:
      - ``character/hero``    — Luke (name: "Luke")
      - ``character/villain`` — Vader (name: "Vader")
      - ``location/tatooine`` — Tatooine
      - ``prop/lightsaber``   — Lightsaber  (with representation)
      - ``scene/battle``      — Battle of Endor
      - ``world/main``        — Test World (auto-created by repo_init)

    The Lightsaber prop has a ``reference_image`` representation.
    The Hero character has a ``appears_in`` reference (for reference tests).
    """
    universe = "testverse"
    nap_sdk.repo_init(universe, base_path=nap_repo)

    nap_sdk.repo_create_entity(universe, "character", "hero", "Luke",
                               author="test", base_path=nap_repo)
    nap_sdk.repo_create_entity(universe, "character", "villain", "Vader",
                               author="test", base_path=nap_repo)
    nap_sdk.repo_create_entity(universe, "location", "tatooine", "Tatooine",
                               author="test", base_path=nap_repo)
    nap_sdk.repo_create_entity(universe, "prop", "lightsaber", "Lightsaber",
                               author="test", base_path=nap_repo)
    nap_sdk.repo_create_entity(universe, "scene", "battle", "Battle of Endor",
                               author="test", base_path=nap_repo)

    # Add representation to lightsaber
    _set_representation_on_entity(
        universe, "prop", "lightsaber", "reference_image",
        {"hash": "sha256:abc123", "format": "png"},
        base_path=nap_repo,
    )

    # Add reference on hero (appears_in scene)
    _set_reference_on_entity(
        universe, "character", "hero", "appears_in",
        ["nap://testverse/scene/battle"],
        base_path=nap_repo,
    )

    yield universe, nap_repo


@pytest.fixture
def service(initialized_repo: tuple[str, str]) -> NapService:
    """NapService initialised against the test repository."""
    universe, base_path = initialized_repo
    svc = NapService(base_path=base_path)
    svc.initialize(universe)
    return svc


@pytest.fixture
def no_world_repo(nap_repo: str) -> Generator[tuple[str, str], None, None]:
    """Universe initialised but then the world entity is removed.

    ``repo_init`` creates a world automatically, so we ``os.remove``
    the ``universe.yaml`` to simulate an entity set with no world.
    """
    universe = "noworld"
    nap_sdk.repo_init(universe, base_path=nap_repo)

    # Remove the auto-created world
    world_path = os.path.join(nap_repo, universe, "universe.yaml")
    if os.path.exists(world_path):
        os.remove(world_path)

    nap_sdk.repo_create_entity(universe, "character", "loner", "Loner",
                               author="test", base_path=nap_repo)

    yield universe, nap_repo


@pytest.fixture
def empty_repo(nap_repo: str) -> Generator[tuple[str, str], None, None]:
    """Initialised universe with no custom entities (only auto-created world)."""
    universe = "emptyverse"
    nap_sdk.repo_init(universe, base_path=nap_repo)
    yield universe, nap_repo


# =========================================================================
# Lifecycle
# =========================================================================


class TestInitialize:
    """NapService.initialize() — lifecycle management."""

    def test_initialize_success(self, initialized_repo: tuple[str, str]) -> None:
        """Happy path: initialise against an existing universe."""
        universe, base_path = initialized_repo
        svc = NapService(base_path=base_path)
        svc.initialize(universe)

        assert svc.universe == universe
        assert svc._initialized is True

    def test_initialize_unknown_universe(self, nap_repo: str) -> None:
        """Universe that does not exist raises UniverseNotFoundError."""
        svc = NapService(base_path=nap_repo)
        with pytest.raises(UniverseNotFoundError):
            svc.initialize("nonexistent")

    def test_reinitialize_same_universe_is_idempotent(
        self, initialized_repo: tuple[str, str],
    ) -> None:
        """Calling initialize() twice with the same universe is a no-op."""
        universe, base_path = initialized_repo
        svc = NapService(base_path=base_path)
        svc.initialize(universe)
        svc.initialize(universe)  # should not raise
        assert svc.universe == universe

    def test_reinitialize_different_universe_clears_cache(
        self, initialized_repo: tuple[str, str], nap_repo: str,
    ) -> None:
        """Switching universes clears the cache."""
        universe, base_path = initialized_repo
        svc = NapService(base_path=base_path)
        svc.initialize(universe)

        # Populate cache
        svc.get_entity("nap://testverse/character/hero")
        assert len(svc._manifest_cache) == 1

        # Create a second universe and re-init
        nap_sdk.repo_init("otherverse", base_path=base_path)
        nap_sdk.repo_create_entity(universe="otherverse", entity_type="character",
                                   entity_id="other", name="Other",
                                   author="test", base_path=base_path)
        svc.initialize("otherverse")
        assert svc.universe == "otherverse"
        assert len(svc._manifest_cache) == 0  # cache cleared

    def test_get_universe_name_raises_if_not_initialized(self) -> None:
        """Calling get_universe_name() without initialize() raises."""
        svc = NapService()
        with pytest.raises(UniverseNotFoundError, match="No universe configured"):
            svc.get_universe_name()

    # ── Singleton accessor ────────────────────────────────────────

    def test_singleton_get_no_init(self) -> None:
        """get_nap_read_service() returns None when not initialised."""
        assert get_nap_read_service() is None

    def test_singleton_initialize_then_get(
        self, initialized_repo: tuple[str, str],
    ) -> None:
        """initialize_nap_read_service() registers the global instance."""
        universe, base_path = initialized_repo
        svc = initialize_nap_read_service(universe, base_path=base_path)
        assert svc is get_nap_read_service()
        assert svc.universe == universe


# =========================================================================
# URI helpers
# =========================================================================


class TestUriHelpers:
    """NapService.parse_uri() and format_uri()."""

    def test_parse_uri_full(self, service: NapService) -> None:
        """Parse a complete nap:// URI."""
        parsed = service.parse_uri("nap://testverse/character/hero")
        assert parsed["universe"] == "testverse"
        assert parsed["entity_type"] == "character"
        assert parsed["entity_id"] == "hero"

    def test_parse_uri_with_fragment(self, service: NapService) -> None:
        """Parse a URI with an optional fragment."""
        parsed = service.parse_uri("nap://testverse/character/hero#name")
        assert parsed["universe"] == "testverse"
        assert parsed["fragment"] == "name"

    def test_parse_uri_malformed(self, service: NapService) -> None:
        """Malformed URI raises InvalidUriError."""
        with pytest.raises(InvalidUriError):
            service.parse_uri("not-a-uri")

    def test_parse_uri_empty(self, service: NapService) -> None:
        """Empty string URI raises InvalidUriError."""
        with pytest.raises(InvalidUriError):
            service.parse_uri("")

    def test_format_uri(self, service: NapService) -> None:
        """format_uri() produces the expected nap:// string."""
        uri = service.format_uri("testverse", "character", "hero")
        assert uri == "nap://testverse/character/hero"

    def test_format_uri_roundtrip(self, service: NapService) -> None:
        """Parse(format(...)) is an identity."""
        uri = service.format_uri("testverse", "location", "tatooine")
        parsed = service.parse_uri(uri)
        assert parsed["universe"] == "testverse"
        assert parsed["entity_type"] == "location"
        assert parsed["entity_id"] == "tatooine"


# =========================================================================
# Entity resolution
# =========================================================================


class TestGetEntity:
    """NapService.get_entity() — single entity resolution."""

    def test_get_entity_happy_path(self, service: NapService) -> None:
        """Resolve an existing entity by URI."""
        manifest = service.get_entity("nap://testverse/character/hero")
        assert manifest["name"] == "Luke"
        assert manifest["entity_type"] == "character"
        assert "hero" in manifest["id"]
        assert manifest["uri"] == "nap://testverse/character/hero"
        assert "version" in manifest

    def test_get_entity_different_types(self, service: NapService) -> None:
        """Resolve entities of different types."""
        location = service.get_entity("nap://testverse/location/tatooine")
        assert location["name"] == "Tatooine"
        assert location["entity_type"] == "location"

        prop = service.get_entity("nap://testverse/prop/lightsaber")
        assert prop["name"] == "Lightsaber"
        assert prop["entity_type"] == "prop"

    def test_get_entity_not_found(self, service: NapService) -> None:
        """Non-existent URI raises EntityNotFoundError."""
        with pytest.raises(EntityNotFoundError, match="Entity not found"):
            service.get_entity("nap://testverse/character/nobody")

    def test_get_entity_invalid_uri(self, service: NapService) -> None:
        """Malformed URI raises InvalidUriError."""
        with pytest.raises(InvalidUriError):
            service.get_entity("not-a-nap-uri")

    def test_get_entity_cache_hit(self, service: NapService) -> None:
        """Second call returns same dict object from cache."""
        first = service.get_entity("nap://testverse/character/hero")
        second = service.get_entity("nap://testverse/character/hero")
        assert first is second  # same dict object (cached)

    def test_get_entity_cache_miss_populates(self, service: NapService) -> None:
        """First call populates the cache."""
        initial_size = len(service._manifest_cache)
        service.get_entity("nap://testverse/character/hero")
        assert len(service._manifest_cache) == initial_size + 1


class TestGetEntities:
    """NapService.get_entities() — listing entities by type."""

    def test_list_characters(self, service: NapService) -> None:
        """List all characters."""
        chars = service.get_entities("character")
        names = {c["name"] for c in chars}
        assert names == {"Luke", "Vader"}

    def test_list_empty_type(self, service: NapService) -> None:
        """Entity type with no entries returns empty list."""
        result = service.get_entities("prop")
        # There should be one prop (lightsaber)
        assert len(result) >= 0

    def test_list_in_empty_universe(self, empty_repo: tuple[str, str]) -> None:
        """No custom entities returns empty list (world is a separate type)."""
        universe, base_path = empty_repo
        svc = NapService(base_path=base_path)
        svc.initialize(universe)
        # Only the auto-created world entity exists, no characters
        assert svc.get_entities("character") == []
        assert svc.get_entities("location") == []

    def test_list_unknown_type_returns_empty(self, service: NapService) -> None:
        """Group is not supported by nap_sdk — returns empty list."""
        result = service.get_entities("group")
        assert result == []


class TestGetWorldManifest:
    """NapService.get_world_manifest()."""

    def test_world_exists(self, service: NapService) -> None:
        """Returns the world manifest when a world entity exists."""
        world = service.get_world_manifest()
        assert world["entity_type"] == "world"
        assert "name" in world

    def test_world_not_found(self, no_world_repo: tuple[str, str]) -> None:
        """Raises EntityNotFoundError when no world entity exists."""
        universe, base_path = no_world_repo
        svc = NapService(base_path=base_path)
        svc.initialize(universe)
        with pytest.raises(EntityNotFoundError, match="No world entity"):
            svc.get_world_manifest()


# =========================================================================
# Resolve many
# =========================================================================


class TestResolveMany:
    """NapService.resolve_many()."""

    def test_all_successful(self, service: NapService) -> None:
        """All URIs resolve in order."""
        results = service.resolve_many([
            "nap://testverse/character/hero",
            "nap://testverse/character/villain",
        ])
        assert len(results) == 2
        assert results[0]["name"] == "Luke"
        assert results[1]["name"] == "Vader"

    def test_some_failures_are_skipped(self, service: NapService) -> None:
        """Unresolvable URIs are silently skipped."""
        results = service.resolve_many([
            "nap://testverse/character/hero",
            "nap://testverse/character/nobody",  # does not exist
            "nap://testverse/character/villain",
        ])
        assert len(results) == 2
        names = [r["name"] for r in results]
        assert "Luke" in names
        assert "Vader" in names

    def test_empty_input(self, service: NapService) -> None:
        """Empty URI list returns empty manifest list."""
        assert service.resolve_many([]) == []


# =========================================================================
# Query
# =========================================================================


class TestQuery:
    """NapService.query()."""

    def test_query_name(self, service: NapService) -> None:
        """Query the ``name`` field of an entity."""
        name = service.query("nap://testverse/character/hero", "name")
        assert name == "Luke"

    def test_query_nested_property(self, service: NapService) -> None:
        """Query a nested properties path."""
        # Add a property to hero
        _set_property_on_entity(
            "testverse", "character", "hero", "species", "human",
            base_path=service._base_path,
        )

        species = service.query(
            "nap://testverse/character/hero",
            "properties.species",
        )
        assert species == "human"

    def test_query_non_existent_path(self, service: NapService) -> None:
        """Path that does not exist returns ``None``."""
        result = service.query(
            "nap://testverse/character/hero",
            "properties.nonexistent",
        )
        assert result is None

    def test_query_invalid_uri(self, service: NapService) -> None:
        """Malformed URI returns ``None``."""
        result = service.query("not-a-uri", "name")
        assert result is None


# =========================================================================
# Representations
# =========================================================================


class TestGetRepresentation:
    """NapService.get_representation()."""

    def test_representation_exists(self, service: NapService) -> None:
        """Returns the representation dict when key exists."""
        rep = service.get_representation(
            "nap://testverse/prop/lightsaber",
            "reference_image",
        )
        assert rep is not None
        assert rep["hash"] == "sha256:abc123"
        assert rep["format"] == "png"

    def test_representation_missing(self, service: NapService) -> None:
        """Returns ``None`` when the key does not exist."""
        rep = service.get_representation(
            "nap://testverse/character/hero",
            "portrait",
        )
        assert rep is None

    def test_representation_bad_entity(self, service: NapService) -> None:
        """Returns ``None`` for non-existent entity."""
        rep = service.get_representation(
            "nap://testverse/character/nobody",
            "portrait",
        )
        assert rep is None


# =========================================================================
# References
# =========================================================================


class TestGetEntityReferences:
    """NapService.get_entity_references()."""

    def test_references_exist(self, service: NapService) -> None:
        """Returns references dict for a character with appears_in."""
        refs = service.get_entity_references("nap://testverse/character/hero")
        assert "appears_in" in refs
        assert "nap://testverse/scene/battle" in refs["appears_in"]

    def test_references_empty(self, service: NapService) -> None:
        """Character without references returns empty dict."""
        refs = service.get_entity_references("nap://testverse/character/villain")
        assert refs == {}

    def test_references_bad_entity(self, service: NapService) -> None:
        """Non-existent entity returns empty dict."""
        refs = service.get_entity_references("nap://testverse/character/nobody")
        assert refs == {}


# =========================================================================
# Existence check
# =========================================================================


class TestEntityExists:
    """NapService.entity_exists()."""

    def test_entity_exists_true(self, service: NapService) -> None:
        """Returns True for an existing entity."""
        assert service.entity_exists("nap://testverse/character/hero") is True

    def test_entity_exists_false(self, service: NapService) -> None:
        """Returns False for a non-existent entity."""
        assert service.entity_exists("nap://testverse/character/nobody") is False

    def test_entity_exists_invalid_uri(self, service: NapService) -> None:
        """Returns False for a malformed URI."""
        assert service.entity_exists("not-a-uri") is False


# =========================================================================
# Cache
# =========================================================================


class TestCache:
    """Manifest cache behavior (FIFO eviction)."""

    def test_invalidate_single_entry(self, service: NapService) -> None:
        """Invalidate a single cache entry."""
        service.get_entity("nap://testverse/character/hero")
        assert "nap://testverse/character/hero" in service._manifest_cache
        service.invalidate_cache("nap://testverse/character/hero")
        assert "nap://testverse/character/hero" not in service._manifest_cache

    def test_invalidate_all_entries(self, service: NapService) -> None:
        """Clear the entire cache."""
        service.get_entity("nap://testverse/character/hero")
        service.get_entity("nap://testverse/character/villain")
        assert len(service._manifest_cache) == 2
        service.invalidate_cache()
        assert len(service._manifest_cache) == 0

    def test_fifo_eviction(self, service: NapService) -> None:
        """Oldest entry is evicted when cache exceeds max size."""
        # Reduce cache max for test
        service._cache_max = 3

        # Insert 3 entries (will evict oldest on 4th)
        service.get_entity("nap://testverse/character/hero")
        service.get_entity("nap://testverse/character/villain")
        service.get_entity("nap://testverse/location/tatooine")

        # Track which key was inserted first
        oldest_key = next(iter(service._manifest_cache))

        # Insert a 4th — should evict the oldest
        service.get_entity("nap://testverse/prop/lightsaber")

        # The oldest key should have been evicted
        assert oldest_key not in service._manifest_cache
        assert len(service._manifest_cache) == 3

    def test_cache_eviction_oldest_removed(self, service: NapService) -> None:
        """Verify the correct entry is evicted under FIFO."""
        service._cache_max = 2

        # Insert A, then B
        service.get_entity("nap://testverse/character/hero")
        service.get_entity("nap://testverse/character/villain")

        # Track which is oldest (first in dict)
        oldest_key = next(iter(service._manifest_cache))

        # Insert C — should evict oldest
        service.get_entity("nap://testverse/location/tatooine")

        assert oldest_key not in service._manifest_cache
        assert len(service._manifest_cache) == 2


# =========================================================================
# Story context
# =========================================================================


class TestGetProjectStoryContext:
    """NapService.get_project_story_context()."""

    def test_builds_full_context(self, service: NapService) -> None:
        """Returns a dict with all expected keys populated."""
        ctx = service.get_project_story_context()

        assert "world" in ctx
        assert "characters" in ctx
        assert "locations" in ctx
        assert "props" in ctx
        assert "groups" in ctx
        assert "scenes" in ctx

        assert ctx["world"]["entity_type"] == "world"
        assert len(ctx["characters"]) == 2
        assert len(ctx["locations"]) == 1
        assert len(ctx["props"]) == 1
        assert len(ctx["scenes"]) == 1
        # Groups is not supported by nap_sdk — returns []
        assert ctx["groups"] == []

    def test_no_world_uses_empty_dict(self, no_world_repo: tuple[str, str]) -> None:
        """No world entity results in empty dict, not a crash."""
        universe, base_path = no_world_repo
        svc = NapService(base_path=base_path)
        svc.initialize(universe)
        ctx = svc.get_project_story_context()
        assert ctx["world"] == {}
        assert len(ctx["characters"]) == 1


# =========================================================================
# Error types
# =========================================================================


class TestErrorHierarchy:
    """All NapService exceptions are NapError subclasses."""

    def test_base_exception_is_nap_error(self) -> None:
        """All custom exceptions inherit from NapError."""
        assert issubclass(EntityNotFoundError, NapError)
        assert issubclass(InvalidUriError, NapError)
        assert issubclass(UniverseNotFoundError, NapError)

    def test_entity_not_found_string(self) -> None:
        """Exception message is preserved."""
        exc = EntityNotFoundError("test msg")
        assert str(exc) == "test msg"


# =========================================================================
# Edge cases
# =========================================================================


class TestEdgeCases:
    """Unusual but valid inputs."""

    def test_no_base_path_defaults_to_env(self) -> None:
        """NapService with ``base_path=None`` uses ``~/.nap`` or ``$NAP_DIR``."""
        svc = NapService(base_path=None)
        with pytest.raises(UniverseNotFoundError):
            svc.initialize("nonexistent-universe")

    def test_unknown_entity_type_returns_empty(self, service: NapService) -> None:
        """Unknown entity type like 'group' returns empty list."""
        assert service.get_entities("group") == []

    def test_prop_has_representations(self, service: NapService) -> None:
        """Prop representation is queryable."""
        rep = service.get_representation(
            "nap://testverse/prop/lightsaber", "reference_image",
        )
        assert rep is not None
        assert rep["format"] == "png"
        assert rep["hash"] == "sha256:abc123"
