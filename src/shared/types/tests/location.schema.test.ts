import { createMockLocation } from "#shared/mocks/mock-location.js";
import { Location } from "#shared/types/workflow.types.js";
import { describe, it, expect } from "vitest";
import { AssetHistory, AssetVersion } from "#shared/types/assets.types.js";
import { z } from "zod";
import { generateId } from "#shared/utils/id.ts";
import { hydrateEntity } from "#shared/utils/entity.utils.js";

const baseLocation = createMockLocation({
  id: generateId(),
  name: "Ancient Ruins",
  referenceId: "Loc_01",
  assets: { description: "Crumbled stone pillars" },
});

const location = hydrateEntity(baseLocation, baseLocation.assets);

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

describe("Location", () => {
  it("✅ parses with empty assets {}", () => {
    expect(() => Location.parse({ ...location, assets: {} })).not.toThrow();
  });

  it("parses with populated assets registry", () => {
    expect(() =>
      Location.parse({
        ...location,
        assets: { location_image: validAssetHistory },
      }),
    ).not.toThrow();
  });

  it("accepts top-level AssetKey shorthand strings from the intersection", () => {
    expect(() =>
      Location.parse({
        ...baseLocation,
        assets: {},
        description: "An ancient site",
        location_image: "https://cdn.example.com/loc.png",
      }),
    ).not.toThrow();
  });

  it("rejects assets with an invalid AssetHistory value", () => {
    expect(() =>
      Location.parse({
        ...baseLocation,
        assets: { location_image: 12345 },
      }),
    ).toThrow();
  });
});
