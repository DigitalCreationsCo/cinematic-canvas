import { describe, it, expect } from "vitest";
import { AssetHistory, AssetVersion } from "#shared/types/assets.types.js";
import { z } from "zod";
import { generateId } from "#shared/utils/id.ts";
import { hydrateEntity } from "#shared/utils/entity.utils.js";

import { createMockProp } from "#shared/mocks/mock-prop.js";
import { Prop } from "#shared/types/workflow.types.js";

const baseProp = createMockProp({
  id: generateId(),
  name: "Mystic Orb",
  referenceId: "Prop_01",
  assets: { description: "Glows with blue light" },
});

const prop: z.input<typeof Prop> = hydrateEntity(baseProp, baseProp.assets);

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

describe("Prop", () => {
  it("✅ parses with empty assets {}", () => {
    expect(() => Prop.parse({ ...prop, assets: {} })).not.toThrow();
  });

  it("parses with populated assets registry", () => {
    expect(() =>
      Prop.parse({
        ...prop,
        assets: { image_file: validAssetHistory },
      }),
    ).not.toThrow();
  });

  it("accepts top-level AssetKey shorthand strings from the intersection", () => {
    expect(() =>
      Prop.parse({
        ...prop,
        assets: {},
        image_file: "https://cdn.example.com/prop.png",
      }),
    ).not.toThrow();
  });
});
