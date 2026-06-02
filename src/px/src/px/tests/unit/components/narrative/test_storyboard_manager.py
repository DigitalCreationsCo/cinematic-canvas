"""Tests for the StoryboardManager — merge semantics, edge cases."""

from __future__ import annotations

from px.components.narrative.storyboard_manager import StoryboardManager

# =========================================================================
# merge_into_project
# =========================================================================


class TestMergeIntoProject:
    """Core merge semantics (mirrors TypeScript StoryboardManager.applyUpdates)."""

    def test_basic_merge(self):
        """Generated entities are merged into current, preserving extras."""
        current = {
            "metadata": {"title": "Old Title", "genre": "drama"},
            "characters": [{"id": "c1", "name": "Alice", "description": "original"}],
            "locations": [],
            "scenes": [],
        }
        generated = {
            "metadata": {"title": "New Title", "logline": "A new logline"},
            "characters": [{"id": "c1", "name": "Alice", "description": "updated"}],
            "scenes": [{"sceneIndex": 0, "name": "Opening", "description": "First scene"}],
        }

        merged = StoryboardManager.merge_into_project(current, generated)

        # Metadata: shallow-merge (incoming wins on conflict)
        assert merged["metadata"]["title"] == "New Title"
        assert merged["metadata"]["genre"] == "drama"  # preserved from current
        assert merged["metadata"]["logline"] == "A new logline"  # added from generated

        # Characters: c1 updated, insertion order preserved
        assert len(merged["characters"]) == 1
        assert merged["characters"][0]["description"] == "updated"

        # Scenes: added from generated
        assert len(merged["scenes"]) == 1
        assert merged["scenes"][0]["name"] == "Opening"

    def test_no_input_mutation(self):
        """Input dicts must never be mutated (copy-modify-write)."""
        current = {"metadata": {"title": "Original"}, "characters": [], "scenes": []}
        generated = {"metadata": {"title": "Updated"}, "characters": [], "scenes": []}

        merged = StoryboardManager.merge_into_project(current, generated)

        assert merged["metadata"]["title"] == "Updated"
        assert current["metadata"]["title"] == "Original"  # unchanged

    def test_empty_current(self):
        """Merging into an empty storyboard should produce the generated content."""
        generated = {
            "metadata": {"title": "Fresh"},
            "characters": [{"id": "c1", "name": "Bob"}],
            "scenes": [{"sceneIndex": 0, "name": "Scene 1"}],
        }

        merged = StoryboardManager.merge_into_project({}, generated)

        assert merged["metadata"]["title"] == "Fresh"
        assert len(merged["characters"]) == 1
        assert len(merged["scenes"]) == 1

    def test_empty_generated(self):
        """Merging empty generated data should preserve current content unchanged."""
        current = {
            "metadata": {"title": "Existing"},
            "characters": [{"id": "c1", "name": "Alice"}],
            "scenes": [{"sceneIndex": 0, "name": "Scene 1"}],
        }

        merged = StoryboardManager.merge_into_project(current, {})

        assert merged["metadata"]["title"] == "Existing"
        assert len(merged["characters"]) == 1
        assert len(merged["scenes"]) == 1

    def test_scenes_re_sorted_by_scene_index(self):
        """Scenes should be sorted by sceneIndex after merge."""
        current = {"scenes": [{"sceneIndex": 2, "name": "Last"}, {"sceneIndex": 0, "name": "First"}]}
        generated = {
            "scenes": [{"sceneIndex": 1, "name": "Middle"}],
        }

        merged = StoryboardManager.merge_into_project(current, generated)

        # Sorting: First (0) → Middle (1) → Last (2)
        assert [s["sceneIndex"] for s in merged["scenes"]] == [0, 1, 2]
        assert merged["scenes"][0]["name"] == "First"
        assert merged["scenes"][1]["name"] == "Middle"
        assert merged["scenes"][2]["name"] == "Last"

    def test_upsert_preserves_existing_order(self):
        """Existing entities keep their order; matching entities are replaced in place."""
        current = {
            "characters": [
                {"id": "c1", "name": "Alice"},
                {"id": "c2", "name": "Bob"},
                {"id": "c3", "name": "Charlie"},
            ]
        }
        generated = {
            "characters": [
                {"id": "c2", "name": "Bob Updated"},  # update
                {"id": "c4", "name": "Diana"},  # net-new
            ]
        }

        merged = StoryboardManager.merge_into_project(current, generated)
        names = [c["name"] for c in merged["characters"]]

        # c1 preserved, c2 updated in place, c3 preserved, c4 appended
        assert names == ["Alice", "Bob Updated", "Charlie", "Diana"]

    def test_props_handled_when_present(self):
        """Props are merged when present in either current or generated."""
        current = {"props": [{"id": "p1", "name": "Sword"}]}
        generated = {"props": [{"id": "p2", "name": "Shield"}]}

        merged = StoryboardManager.merge_into_project(current, generated)

        assert len(merged["props"]) == 2
        assert merged["props"][0]["name"] == "Sword"
        assert merged["props"][1]["name"] == "Shield"

    def test_duplicate_prevention(self):
        """Repeated merge calls with the same data should not duplicate entities."""
        current = {"characters": [{"id": "c1", "name": "Alice"}]}
        generated1 = {"characters": [{"id": "c1", "name": "Alice v2"}]}
        generated2 = {"characters": [{"id": "c1", "name": "Alice v3"}]}

        merged1 = StoryboardManager.merge_into_project(current, generated1)
        assert len(merged1["characters"]) == 1

        merged2 = StoryboardManager.merge_into_project(merged1, generated2)
        assert len(merged2["characters"]) == 1
        assert merged2["characters"][0]["name"] == "Alice v3"

    def test_input_with_no_ids_falls_back_to_append(self):
        """If generated items have no ``id`` field, they are appended (not deduped)."""
        current = {"characters": [{"ref": "c1", "name": "Alice"}]}
        generated = {"characters": [{"ref": "c1", "name": "Alice Updated"}]}

        merged = StoryboardManager.merge_into_project(current, generated)
        assert len(merged["characters"]) == 2  # both appended, no id match

    def test_current_storyboard_is_none(self):
        """When current_storyboard.get() returns None, merge still works."""
        current = {}
        generated = {"metadata": {"title": "Test"}, "scenes": [{"sceneIndex": 0, "name": "S1"}]}

        merged = StoryboardManager.merge_into_project(current, generated)

        assert merged["metadata"]["title"] == "Test"
        assert len(merged["scenes"]) == 1


# =========================================================================
# _upsert_entities (merge primitive)
# =========================================================================


class TestUpsertEntities:
    """Low-level upsert primitive."""

    def test_both_empty(self):
        assert StoryboardManager._upsert_entities([], []) == []

    def test_empty_existing(self):
        result = StoryboardManager._upsert_entities([], [{"id": "a", "name": "A"}])
        assert len(result) == 1
        assert result[0]["name"] == "A"

    def test_empty_incoming(self):
        result = StoryboardManager._upsert_entities([{"id": "a", "name": "A"}], [])
        assert len(result) == 1

    def test_update_existing(self):
        existing = [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}]
        incoming = [{"id": "a", "name": "A Updated"}]

        result = StoryboardManager._upsert_entities(existing, incoming)

        assert len(result) == 2
        assert result[0]["name"] == "A Updated"
        assert result[1]["name"] == "B"

    def test_append_net_new(self):
        existing = [{"id": "a", "name": "A"}]
        incoming = [{"id": "b", "name": "B"}]

        result = StoryboardManager._upsert_entities(existing, incoming)

        assert len(result) == 2
        assert result[1]["name"] == "B"

    def test_update_and_append(self):
        existing = [{"id": "a", "name": "A"}, {"id": "b", "name": "B"}]
        incoming = [{"id": "b", "name": "B Updated"}, {"id": "c", "name": "C"}]

        result = StoryboardManager._upsert_entities(existing, incoming)

        assert len(result) == 3
        assert result[0]["name"] == "A"  # unchanged
        assert result[1]["name"] == "B Updated"  # updated in place
        assert result[2]["name"] == "C"  # appended

    def test_no_id_items_appended(self):
        existing = [{"id": "a", "name": "A"}]
        incoming = [{"name": "NoID Item"}]

        result = StoryboardManager._upsert_entities(existing, incoming)

        assert len(result) == 2
        assert result[1]["name"] == "NoID Item"

    def test_input_not_mutated(self):
        existing = [{"id": "a", "name": "A"}]
        incoming = [{"id": "a", "name": "A Updated"}]

        result = StoryboardManager._upsert_entities(existing, incoming)

        # Original existing dict should not change
        assert existing[0]["name"] == "A"
        # Result has the new version
        assert result[0]["name"] == "A Updated"


# =========================================================================
# _as_list helper
# =========================================================================


class TestAsList:
    def test_none(self):
        assert StoryboardManager._as_list(None) == []

    def test_list(self):
        assert StoryboardManager._as_list([1, 2, 3]) == [1, 2, 3]

    def test_non_list_iterable(self):
        assert StoryboardManager._as_list("abc") == ["abc"]

    def test_empty_list(self):
        assert StoryboardManager._as_list([]) == []
