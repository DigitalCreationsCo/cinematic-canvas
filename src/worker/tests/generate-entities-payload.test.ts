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

  it("unwraps the legacy wrapped payload shape", () => {
    const entities = [
      {
        entityType: "location" as const,
        data: { id: "018f4f51-7a8f-7f02-a41d-b8bd54522222", name: "Atrium" },
        images: [
          {
            gcsUri: "gs://bucket/atrium.png",
            publicUri: "https://example.com/atrium.png",
            mimeType: "image/png",
          },
        ],
      },
    ];

    expect(normalizeGenerateEntitiesPayload({ entities })).toEqual(entities);
  });
});
