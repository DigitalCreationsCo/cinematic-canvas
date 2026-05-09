// shared/services/storyboard-manager.test.ts
import { createMockStoryboardLive } from "#shared/mocks/mock-storyboard.js";
import { createMockCharacter } from "#shared/mocks/mock-character.js";
import { createMockLocation } from "#shared/mocks/mock-location.js";
import { createMockScene } from "#shared/mocks/mock-scene.js";
import { createMockProjectMetadata } from "#shared/mocks/mock-metadata.ts";

import { describe, it, expect, beforeEach } from "vitest";
import { StoryboardManager } from "#shared/services/storyboard-manager.js";
import {
  CharacterCondensed,
  LiveStoryboard,
  LocationCondensed,
  SceneCondensed,
  makeEmptyLiveStoryboard,
} from "#shared/types/storyboard.types.js";
import { ProjectMetadata } from "#shared/types/metadata.types.js";
import { generateId } from "#shared/utils/id.js";

const BASE_METADATA: Partial<ProjectMetadata> = {
  projectId: generateId(),
  title: "Test Project",
  totalScenes: 0,
  colorPalette: [],
  tags: [],
  initialPrompt: "test prompt",
  hasAudio: false,
};

function makeStoryboard(
  overrides: {
    metadata?: Partial<ProjectMetadata>;
    characters?: CharacterCondensed[];
    locations?: LocationCondensed[];
    scenes?: SceneCondensed[];
  } = {},
): LiveStoryboard {
  return {
    metadata: createMockProjectMetadata({ ...BASE_METADATA, ...overrides.metadata }),
    characters: overrides.characters ?? [],
    locations: overrides.locations ?? [],
    scenes: overrides.scenes ?? [],
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe("StoryboardManager", () => {
  let manager: StoryboardManager;

  beforeEach(() => {
    manager = new StoryboardManager();
  });

  // --------------------------------------------------------------------------
  // INSERTION — net-new entities
  // --------------------------------------------------------------------------

  describe("inserting new entities", () => {
    it("adds a character to an empty storyboard", () => {
      const sbLive = createMockStoryboardLive();

      const result = manager.applyUpdates(sb, {
        metadata: sbLive.metadata,
        characters: [createMockCharacter({ referenceId: "char_hero", name: "Hero", description: "A brave hero" })],
        locations: [],
        scenes: [],
      });

      expect(result.characters).toHaveLength(1);
      expect(result.characters[0]).toEqual(
        expect.objectContaining({
          referenceId: "char_hero",
          name: "Hero",
          description: "A brave hero",
        }),
      );
    });

    it("adds a location to an empty storyboard", () => {
      const sb = createMockStoryboardLive();

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [],
        locations: [createMockLocation({ referenceId: "loc_forest", name: "Forest", description: "A dark forest" })],
        scenes: [],
      });

      expect(result.locations).toHaveLength(1);
      expect(result.locations[0]).toEqual(
        expect.objectContaining({
          referenceId: "loc_forest",
          name: "Forest",
          description: "A dark forest",
        }),
      );
    });

    it("adds a scene to an empty storyboard", () => {
      const sb = createMockStoryboardLive();

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [],
        locations: [],
        scenes: [
          createMockScene({
            sceneIndex: 0,
            name: "Opening",
            description: "The hero arrives",
          }),
        ],
      });

      expect(result.scenes).toHaveLength(1);
      expect(result.scenes[0]).toEqual(
        expect.objectContaining({
          sceneIndex: 0,
          name: "Opening",
          description: "The hero arrives",
        }),
      );
    });

    it("appends net-new entities alongside existing ones", () => {
      const existingChar = condensedChar("00000000-0000-7000-a000-000000000011", "char_hero", "Hero", "A brave hero");
      const sb = createMockStoryboardLive({ characters: [existingChar] });

      const newChar = createMockCharacter({
        referenceId: "char_villain",
        name: "Villain",
        assets: { __mockDescription: "A cunning villain" } as any,
      });

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [createMockCharacter({ id: existingChar.id }), newChar],
        locations: [],
        scenes: [],
      });

      expect(result.characters).toHaveLength(2);
      expect(result.characters.map((c) => c.id)).toEqual([existingChar.id, newChar.id]);
    });

    it("produces description as empty string when no description asset exists", () => {
      const sb = createMockStoryboardLive();
      const charWithNoDescription = createMockCharacter({
        assets: {} as any, // no __mockDescription → getAllBestAssets returns {}
      });

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [charWithNoDescription],
        locations: [],
        scenes: [],
      });

      expect(result.characters[0].description).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // UPDATES — existing entities by id
  // --------------------------------------------------------------------------

  describe("updating existing entities", () => {
    it("updates character fields without duplicating the entry", () => {
      const existingId = "00000000-0000-7000-a000-000000000011";
      const sb = createMockStoryboardLive({
        characters: [condensedChar(existingId, "char_hero", "Hero", "Old description")],
      });

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [
          createMockCharacter({
            id: existingId,
            name: "Hero (Upgraded)",
            assets: { __mockDescription: "New description after growth arc" } as any,
          }),
        ],
        locations: [],
        scenes: [],
      });

      expect(result.characters).toHaveLength(1);
      expect(result.characters[0].name).toBe("Hero (Upgraded)");
      expect(result.characters[0].description).toBe("New description after growth arc");
    });

    it("updates a location while preserving other locations", () => {
      const locToUpdateId = "00000000-0000-7000-a000-000000000021";
      const untouchedLocId = "00000000-0000-7000-a000-000000000022";

      const sb = createMockStoryboardLive({
        locations: [
          condensedLoc(locToUpdateId, "loc_forest", "Forest", "Old"),
          condensedLoc(untouchedLocId, "loc_castle", "Castle", "Stone walls"),
        ],
      });

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [],
        locations: [
          makeMockLocation({
            id: locToUpdateId,
            name: "Forest (Night)",
            assets: { __mockDescription: "A dark forest at midnight" } as any,
          }),
          makeMockLocation({
            id: untouchedLocId,
            referenceId: "loc_castle",
            name: "Castle",
            assets: { __mockDescription: "Stone walls" } as any,
          }),
        ],
        scenes: [],
      });

      expect(result.locations).toHaveLength(2);
      expect(result.locations[0].name).toBe("Forest (Night)");
      expect(result.locations[0].description).toBe("A dark forest at midnight");
      expect(result.locations[1].name).toBe("Castle"); // unchanged
    });

    it("updates a scene description when an asset workload completes", () => {
      const sceneId = "00000000-0000-7000-a000-000000000031";
      const sb = createMockStoryboardLive({
        scenes: [SceneCondensed(sceneId, 0, "Opening", "")],
      });

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [],
        locations: [],
        scenes: [
          makeScene({
            id: sceneId,
            sceneIndex: 0,
            name: "Opening",
            assets: { __mockDescription: "Hero emerges from the mist" } as any,
          }),
        ],
      });

      expect(result.scenes[0].description).toBe("Hero emerges from the mist");
      expect(result.scenes).toHaveLength(1);
    });

    it("preserves insertion order of existing entities after an update", () => {
      const ids = [
        "00000000-0000-7000-a000-000000000011",
        "00000000-0000-7000-a000-000000000012",
        "00000000-0000-7000-a000-000000000013",
      ];

      const sb = createMockStoryboardLive({
        characters: ids.map((id, i) => condensedChar(id, `char_${i}`, `Char ${i}`, "desc")),
      });

      // Update only the middle character
      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: ids.map((id, i) =>
          createMockCharacter({
            id,
            referenceId: `char_${i}`,
            name: id === ids[1] ? "Updated Middle" : `Char ${i}`,
          }),
        ),
        locations: [],
        scenes: [],
      });

      expect(result.characters.map((c) => c.id)).toEqual(ids);
      expect(result.characters[1].name).toBe("Updated Middle");
    });
  });

  // --------------------------------------------------------------------------
  // DEDUPLICATION GUARANTEES
  // --------------------------------------------------------------------------

  describe("deduplication", () => {
    it("never duplicates a character when the same id appears twice in incoming", () => {
      const sb = createMockStoryboardLive();
      const char = createMockCharacter();

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [char, char], // duplicated by caller mistake
        locations: [],
        scenes: [],
      });

      expect(result.characters).toHaveLength(1);
    });

    it("never duplicates entities across successive applyUpdates calls", () => {
      const char = createMockCharacter();
      let sb = createMockStoryboardLive();

      sb = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [char],
        locations: [],
        scenes: [],
      }) as unknown as LiveStoryboard;

      // Same character appears again in a subsequent workload
      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [char],
        locations: [],
        scenes: [],
      });

      expect(result.characters).toHaveLength(1);
    });

    it("does not duplicate scenes when called repeatedly with the same scene set", () => {
      const scenes = [0, 1, 2].map((i) =>
        makeScene({
          id: `0000000${i}-0000-7000-a000-000000000031`,
          sceneIndex: i,
          name: `Scene ${i}`,
        }),
      );

      let sb = createMockStoryboardLive();

      for (let i = 0; i < 3; i++) {
        sb = manager.applyUpdates(sb, {
          metadata: sb.metadata,
          characters: [],
          locations: [],
          scenes,
        }) as unknown as LiveStoryboard;
      }

      expect(sb.scenes).toHaveLength(3);
    });
  });

  // --------------------------------------------------------------------------
  // SCENE ORDERING
  // --------------------------------------------------------------------------

  describe("scene ordering", () => {
    it("sorts scenes by sceneIndex regardless of incoming order", () => {
      const sb = createMockStoryboardLive();
      const scenes = [2, 0, 1].map((i) =>
        makeScene({
          id: `0000000${i}-0000-7000-a000-000000000031`,
          sceneIndex: i,
          name: `Scene ${i}`,
        }),
      );

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [],
        locations: [],
        scenes,
      });

      expect(result.scenes.map((s) => s.sceneIndex)).toEqual([0, 1, 2]);
    });

    it("re-sorts scenes after an update changes no indices", () => {
      // Seed storyboard with already-sorted scenes, confirm order is stable
      const sb = createMockStoryboardLive({
        scenes: [0, 1, 2].map((i) => SceneCondensed(`0000000${i}-0000-7000-a000-000000000031`, i, `Scene ${i}`)),
      });

      const result = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [],
        locations: [],
        scenes: [0, 1, 2].map((i) =>
          makeScene({
            id: `0000000${i}-0000-7000-a000-000000000031`,
            sceneIndex: i,
            name: `Scene ${i} (updated)`,
          }),
        ),
      });

      expect(result.scenes.map((s) => s.sceneIndex)).toEqual([0, 1, 2]);
    });
  });

  // --------------------------------------------------------------------------
  // METADATA MERGE
  // --------------------------------------------------------------------------

  describe("metadata merging", () => {
    it("incoming metadata values win on key conflict", () => {
      const sb = createMockStoryboardLive({ metadata: { title: "Old Title", totalScenes: 3 } });

      const result = manager.applyUpdates(sb, {
        metadata: makeMetadata({ title: "New Title", totalScenes: 6 }),
        characters: [],
        locations: [],
        scenes: [],
      });

      expect(result.metadata.title).toBe("New Title");
      expect(result.metadata.totalScenes).toBe(6);
    });

    it("preserves existing metadata fields absent from the incoming source", () => {
      const sb = createMockStoryboardLive({ metadata: { style: "noir", colorPalette: ["#000", "#fff"] } });

      const result = manager.applyUpdates(sb, {
        metadata: makeMetadata({ title: "Updated Title" }),
        characters: [],
        locations: [],
        scenes: [],
      });

      expect(result.metadata.style).toBe("noir");
      expect(result.metadata.colorPalette).toEqual(["#000", "#fff"]);
    });

    it("metadata is merged shallowly — nested objects from incoming replace those from existing", () => {
      // AudioAnalysis or similar nested objects: incoming wins entirely if present
      const sb = createMockStoryboardLive({ metadata: { tags: ["action", "drama"] } });

      const result = manager.applyUpdates(sb, {
        metadata: makeMetadata({ tags: ["comedy"] }),
        characters: [],
        locations: [],
        scenes: [],
      });

      expect(result.metadata.tags).toEqual(["comedy"]);
    });
  });

  // --------------------------------------------------------------------------
  // COPY-MODIFY-WRITE / IMMUTABILITY
  // --------------------------------------------------------------------------

  describe("copy-modify-write safety", () => {
    it("does not mutate the original storyboard's character array", () => {
      const sb = createMockStoryboardLive();
      const originalRef = sb.characters;

      manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [createMockCharacter()],
        locations: [],
        scenes: [],
      });

      expect(sb.characters).toBe(originalRef);
      expect(sb.characters).toHaveLength(0);
    });

    it("does not mutate existing condensed entities during an update", () => {
      const existingChar = condensedChar("00000000-0000-7000-a000-000000000011", "char_hero", "Hero", "Original");
      const sb = createMockStoryboardLive({ characters: [existingChar] });

      manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [
          createMockCharacter({
            id: existingChar.id,
            name: "Hero (Mutated?)",
            assets: { __mockDescription: "Different" } as any,
          }),
        ],
        locations: [],
        scenes: [],
      });

      // The original condensed entity in the seed storyboard must be untouched
      expect(existingChar.name).toBe("Hero");
      expect(existingChar.description).toBe("Original");
    });

    it("successive calls produce independent storyboard objects", () => {
      const sb = createMockStoryboardLive();

      const result1 = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [createMockCharacter({ id: "00000000-0000-7000-a000-000000000011", name: "Alpha" })],
        locations: [],
        scenes: [],
      });

      const result2 = manager.applyUpdates(result1 as unknown as LiveStoryboard, {
        metadata: result1.metadata,
        characters: [
          createMockCharacter({ id: "00000000-0000-7000-a000-000000000011", name: "Alpha" }),
          createMockCharacter({ id: "00000000-0000-7000-a000-000000000012", referenceId: "char_beta", name: "Beta" }),
        ],
        locations: [],
        scenes: [],
      });

      expect(result1.characters).toHaveLength(1);
      expect(result2.characters).toHaveLength(2);
    });
  });

  // --------------------------------------------------------------------------
  // MIXED WORKLOAD — simulates a realistic job sequence
  // --------------------------------------------------------------------------

  describe("realistic multi-workload simulation", () => {
    it("correctly accumulates state across a full storyboard → image gen → video gen sequence", () => {
      const charId = generateId();
      const locId = generateId();
      const sceneIds = [generateId(), generateId()];

      const char = createMockCharacter({ id: charId, name: "Protagonist" });
      const loc = makeMockLocation({ id: locId, name: "Rooftop" });
      const scenes = sceneIds.map((id, i) => makeScene({ id, sceneIndex: i, name: `Scene ${i}` }));

      // Step 1: GENERATE_STORYBOARD
      let sb = makeEmptyLiveStoryboard(makeMetadata({ title: "My Film", totalScenes: 2 }));
      sb = manager.applyUpdates(sb, {
        metadata: makeMetadata({ title: "My Film", totalScenes: 2 }),
        characters: [char],
        locations: [loc],
        scenes,
      }) as unknown as LiveStoryboard;

      expect(sb.characters).toHaveLength(1);
      expect(sb.locations).toHaveLength(1);
      expect(sb.scenes).toHaveLength(2);

      // Step 2: GENERATE_CHARACTER_IMAGES — characters updated, others unchanged
      sb = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [
          createMockCharacter({
            id: charId,
            name: "Protagonist",
            assets: { __mockDescription: "Tall, dark-haired protagonist" } as any,
          }),
        ],
        locations: [loc],
        scenes,
      }) as unknown as LiveStoryboard;

      expect(sb.characters[0].description).toBe("Tall, dark-haired protagonist");
      expect(sb.characters).toHaveLength(1); // no duplication

      // Step 3: GENERATE_SCENE_VIDEO — one scene updated with description
      sb = manager.applyUpdates(sb, {
        metadata: sb.metadata,
        characters: [char],
        locations: [loc],
        scenes: [
          makeScene({
            id: sceneIds[0],
            sceneIndex: 0,
            name: "Scene 0",
            assets: { __mockDescription: "Protagonist leaps across rooftops" } as any,
          }),
          scenes[1],
        ],
      }) as unknown as LiveStoryboard;

      expect(sb.scenes[0].description).toBe("Protagonist leaps across rooftops");
      expect(sb.scenes[1].description).toBe("The hero arrives"); // factory default, untouched
      expect(sb.scenes).toHaveLength(2);
      expect(sb.characters).toHaveLength(1); // still no duplicates
      expect(sb.locations).toHaveLength(1);
    });
  });
});
