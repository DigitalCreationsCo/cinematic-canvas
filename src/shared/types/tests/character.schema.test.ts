// character.schema.test.ts
import { createMockCharacter } from "#shared/mocks/mock-character.js";
import { describe, it, expect } from "vitest";
import { Character } from "#shared/types/workflow.types.js";
import { AssetHistory, AssetRegistry, AssetVersion } from "#shared/types/assets.types.js";
import { z } from "zod";

import { generateId } from "#shared/utils/id.ts";
import { hydrateEntity } from "#shared/utils/entity.utils.js";

const baseCharacter = createMockCharacter({
  id: generateId(),
  name: "Aria",
  referenceId: "Aria",
  assets: { description: "Aria's description" },
});

const character: z.input<typeof Character> = hydrateEntity(baseCharacter, baseCharacter.assets);

const validAssetVersion: z.input<typeof AssetVersion> = {
  version: 1,
  data: "https://cdn.example.com/image.png",
  type: "image",
  metadata: {},
};

const validAssetHistory: z.input<typeof AssetHistory> = {
  head: 1,
  best: 1,
  versions: [validAssetVersion],
};

describe("AssetVersion", () => {
  it("parses a fully populated version", () => {
    expect(() => AssetVersion.parse(validAssetVersion)).not.toThrow();
  });

  it("applies metadata defaults when metadata is omitted", () => {
    const result = AssetVersion.parse({
      ...validAssetVersion,
      metadata: undefined,
    });
    expect(result.metadata).toEqual({});
  });

  it("coerces startedAt and createdAt from ISO strings", () => {
    const result = AssetVersion.parse({
      ...validAssetVersion,
      startedAt: "2024-01-01T00:00:00.000Z",
      createdAt: "2024-06-15T12:00:00.000Z",
    });
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it("defaults startedAt and createdAt to now when omitted", () => {
    const before = new Date();
    const result = AssetVersion.parse(validAssetVersion);
    expect(result.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("accepts nullish userFeedback", () => {
    expect(() => AssetVersion.parse({ ...validAssetVersion, userFeedback: null })).not.toThrow();

    expect(() => AssetVersion.parse({ ...validAssetVersion, userFeedback: undefined })).not.toThrow();
  });

  it("rejects a version missing required `data`", () => {
    const { data: _, ...invalid } = validAssetVersion;
    expect(() => AssetVersion.parse(invalid)).toThrow();
  });

  it("rejects a version missing required `type`", () => {
    const { type: _, ...invalid } = validAssetVersion;
    expect(() => AssetVersion.parse(invalid)).toThrow();
  });

  it("rejects non-number `version`", () => {
    expect(() => AssetVersion.parse({ ...validAssetVersion, version: "one" })).toThrow();
  });
});

// ─── AssetHistory ─────────────────────────────────────────────────────────────
describe("AssetHistory", () => {
  it("parses a valid history", () => {
    expect(() => AssetHistory.parse(validAssetHistory)).not.toThrow();
  });

  it("defaults head, best, and versions when omitted", () => {
    const result = AssetHistory.parse({});
    expect(result.head).toBe(0);
    expect(result.best).toBe(0);
    expect(result.versions).toEqual([]);
  });

  it("accepts empty versions array", () => {
    const result = AssetHistory.parse({ head: 0, best: 0, versions: [] });
    expect(result.versions).toEqual([]);
  });

  it("rejects non-array versions", () => {
    expect(() => AssetHistory.parse({ ...validAssetHistory, versions: "not-an-array" })).toThrow();
  });
});

// ─── AssetRegistry ────────────────────────────────────────────────────────────
describe("AssetRegistry", () => {
  it("✅ accepts an empty object {}", () => {
    expect(() => AssetRegistry.parse({})).not.toThrow();
  });

  it("defaults to {} when value is undefined", () => {
    const result = AssetRegistry.parse(undefined);
    expect(result).toEqual({});
  });

  it("accepts a registry with one valid AssetKey entry", () => {
    expect(() => AssetRegistry.parse({ character_image: validAssetHistory })).not.toThrow();
  });

  it("accepts a registry with multiple valid AssetKey entries", () => {
    expect(() =>
      AssetRegistry.parse({
        character_image: validAssetHistory,
        description: { head: 0, best: 0, versions: [] },
      }),
    ).not.toThrow();
  });

  it("allows optional (missing) keys — partialRecord behaviour", () => {
    // Only one key present — others should not be required
    const result = AssetRegistry.parse({ character_image: validAssetHistory });
    expect(result.description).toBeUndefined();
  });

  it("rejects a registry where a value is not a valid AssetHistory", () => {
    expect(() => AssetRegistry.parse({ character_image: { invalid: true } })).toThrow();
  });

  it("rejects a registry where a value is a plain string instead of AssetHistory", () => {
    expect(() => AssetRegistry.parse({ character_image: "https://example.com/img.png" })).toThrow();
  });
});

// ─── Character (full intersection) ────────────────────────────────────────────
describe("Character", () => {
  it("✅ parses with empty assets {}", () => {
    expect(() => Character.parse({ ...character, assets: {} })).not.toThrow();
  });

  it("✅ parses when assets is undefined (uses registry default)", () => {
    expect(() => Character.parse({ ...character })).not.toThrow();
  });

  it("parses with populated assets registry", () => {
    expect(() =>
      Character.parse({
        ...character,
        assets: { character_image: validAssetHistory },
      }),
    ).not.toThrow();
  });

  it("accepts top-level AssetKey shorthand strings from the intersection", () => {
    // The .and(z.partialRecord(AssetKey, z.string())) intersection
    // allows e.g. character.description = "A brave warrior"
    expect(() =>
      Character.parse({
        ...baseCharacter,
        assets: {},
        description: "A brave warrior",
        character_image: "https://cdn.example.com/image.png",
      }),
    ).not.toThrow();
  });

  it("does not require top-level AssetKey shorthand strings", () => {
    // partialRecord means these are all optional
    expect(() => Character.parse({ ...character, assets: {} })).not.toThrow();
  });

  it("rejects a character missing required base fields", () => {
    expect(
      () => Character.parse({ assets: {} }), // no id, name, etc.
    ).toThrow();
  });

  it("rejects assets with an invalid AssetHistory value", () => {
    expect(() =>
      Character.parse({
        ...baseCharacter,
        assets: { character_image: "not-a-history-object" },
      }),
    ).toThrow();
  });

  it("safeParse returns success:false with error details for invalid input", () => {
    const result = Character.safeParse({ assets: {} }); // missing base fields
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it("safeParse returns success:true for the empty assets edge case", () => {
    const result = Character.safeParse({ ...character, assets: {} });
    expect(result.success).toBe(true);
  });

  it("round-trips through parse — output re-parses cleanly", () => {
    const input = {
      ...character,
      assets: { character_image: validAssetHistory },
      description: "A brave warrior",
    };
    const first = Character.parse(input);
    expect(() => Character.parse(first)).not.toThrow();
  });
});
