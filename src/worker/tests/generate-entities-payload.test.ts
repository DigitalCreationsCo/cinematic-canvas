import { describe, expect, it } from "vitest";

import { normalizeGenerateEntitiesPayload } from "../utils/generate-entities-payload.js";

describe("normalizeGenerateEntitiesPayload", () => {
  it("returns the current array payload unchanged", () => {
    const payload = [
      {
        entityType: "character" as const,
        data: { id: "018f4f51-7a8f-7f02-a41d-b8bd54511111", name: "Rook" },
        images: [
          {
            gcsUri: "gs://bucket/rook.png",
            publicUri: "https://example.com/rook.png",
            mimeType: "image/png",
          },
        ],
      },
    ];

    expect(normalizeGenerateEntitiesPayload(payload)).toEqual(payload);
  });
});
