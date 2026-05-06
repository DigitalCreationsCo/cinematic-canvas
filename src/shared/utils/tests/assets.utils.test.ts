import { getAllBestAssets, entityTypeOf, entityIdAt } from "#shared/utils/assets.utils.ts";
import { resolvePublicUrl } from "#shared/utils/utils.js";
import { Scope, AssetRegistry, AssetHistory } from "#shared/types/assets.types.ts";
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers — builds AssetRegistry-shaped data using the real schema contract:
//   versions: AssetVersion[] (array, NOT object-keyed)
//   best / head: version pointers (numbers)
// ---------------------------------------------------------------------------

const mockMetadata = { evaluation: null, model: "test-model", jobId: "job-1" } as any;

/** Creates a single-key AssetRegistry with the versions array properly shaped. */
const createMockAssets = (assetKey: string, dataForBest: string, best: number = 1): AssetRegistry =>
  ({
    [assetKey]: {
      best,
      head: best,
      versions: [
        {
          version: 0,
          data: "version-0-data",
          type: "video" as const,
          metadata: mockMetadata,
          createdAt: new Date("2023-01-01"),
        },
        {
          version: best,
          data: dataForBest,
          type: "video" as const,
          metadata: mockMetadata,
          createdAt: new Date("2023-01-02"),
        },
        ...(best !== 2
          ? [
              {
                version: 2,
                data: "version-2-data",
                type: "video" as const,
                metadata: mockMetadata,
                createdAt: new Date("2023-01-03"),
              },
            ]
          : []),
      ].reduce((acc, curr) => {
        // Keep the last occurrence of each version (so the 'best' one overrides the dummy 0)
        const existingIdx = acc.findIndex((x) => x.version === curr.version);
        if (existingIdx >= 0) {
          acc[existingIdx] = curr;
        } else {
          acc.push(curr);
        }
        return acc;
      }, [] as any[]),
    } as AssetHistory,
  }) as AssetRegistry;

describe("Asset Access Patterns", () => {
  describe("getAllBestAssets", () => {
    it("should return assets with best version data", () => {
      const mockAssets = createMockAssets("scene_video", "best-video-data.mp4", 1);

      const result = getAllBestAssets(mockAssets);

      expect(result["scene_video"]).toBeDefined();
      expect(result["scene_video"]?.data).toBe("best-video-data.mp4");
      expect(result["scene_video"]?.version).toBe(1);
    });

    it("should handle assets with best version 0", () => {
      const mockAssets = createMockAssets("image_file", "best-image.jpg", 0);

      const result = getAllBestAssets(mockAssets);

      expect(result["image_file"]).toBeDefined();
      expect(result["image_file"]?.data).toBe("best-image.jpg");
      expect(result["image_file"]?.version).toBe(0);
    });

    it("should handle multiple asset types", () => {
      const mockAssets: AssetRegistry = {
        ...createMockAssets("scene_video", "video.mp4", 1),
        ...createMockAssets("scene_start_frame", "start-frame.jpg", 2),
        ...createMockAssets("scene_end_frame", "end-frame.jpg", 1),
      };

      const result = getAllBestAssets(mockAssets);

      expect(result["scene_video"]?.data).toBe("video.mp4");
      expect(result["scene_start_frame"]?.data).toBe("start-frame.jpg");
      expect(result["scene_end_frame"]?.data).toBe("end-frame.jpg");
    });

    it("should handle empty assets object", () => {
      const result = getAllBestAssets({});

      expect(Object.keys(result)).toHaveLength(0);
    });

    it("should handle null and undefined assets", () => {
      expect(getAllBestAssets(null)).toEqual({});
      expect(getAllBestAssets(undefined)).toEqual({});
    });

    it("should handle assets where best pointer resolves to a version", () => {
      const mockAssets: AssetRegistry = {
        scene_video: {
          head: 1,
          best: 1,
          versions: [
            {
              data: "version-0-data",
              createdAt: new Date("2023-01-01"),
              version: 0,
              type: "video" as const,
              metadata: mockMetadata,
            },
            {
              data: "version-1-data",
              createdAt: new Date("2023-01-01"),
              version: 1,
              type: "video" as const,
              metadata: mockMetadata,
            },
          ],
        } as AssetHistory,
      };

      const result = getAllBestAssets(mockAssets);

      expect(result["scene_video"]).toBeDefined();
      expect(result["scene_video"]?.data).toBe("version-1-data");
      expect(result["scene_video"]?.version).toBe(1);
    });

    it("should handle assets with undefined best (falls back to no match)", () => {
      const mockAssets = {
        scene_video: {
          best: undefined,
          head: 0,
          versions: [
            {
              data: "version-0-data",
              createdAt: new Date("2023-01-01"),
              version: 0,
              type: "video" as const,
              metadata: mockMetadata,
            },
            {
              data: "version-1-data",
              createdAt: new Date("2023-01-02"),
              version: 1,
              type: "video" as const,
              metadata: mockMetadata,
            },
          ],
        },
      };

      const result = getAllBestAssets(mockAssets as any);

      // best is undefined, so .find(v => v.version === undefined) returns nothing
      expect(result["scene_video"]).toBeUndefined();
    });
  });

  describe("Asset Access Pattern Migration", () => {
    it("should replace old array-index pattern with getAllBestAssets usage", () => {
      const mockAssets = createMockAssets("scene_video", "best-video.mp4", 1);

      // Old pattern used object-keyed versions — now versions is an array,
      // so the canonical accessor is getAllBestAssets.
      const newPattern = getAllBestAssets(mockAssets)["scene_video"]?.data;

      expect(newPattern).toBe("best-video.mp4");
    });

    it("should handle edge cases consistently (best=0)", () => {
      const edgeCaseAssets: AssetRegistry = {
        scene_video: {
          best: 0,
          head: 0,
          versions: [
            {
              data: "edge-case-video.mp4",
              createdAt: new Date("2023-01-01"),
              version: 0,
              type: "video" as const,
              metadata: mockMetadata,
            },
          ],
        } as AssetHistory,
      };

      const result = getAllBestAssets(edgeCaseAssets)["scene_video"];

      expect(result?.data).toBe("edge-case-video.mp4");
      expect(result?.version).toBe(0);
    });
  });
});

describe("resolvePublicUrl", () => {
  it("should return empty string for null/undefined", () => {
    expect(resolvePublicUrl(null)).toBe("");
    expect(resolvePublicUrl(undefined)).toBe("");
  });

  it("should return http/https URLs as is", () => {
    expect(resolvePublicUrl("https://example.com/image.png")).toBe("https://example.com/image.png");
    expect(resolvePublicUrl("http://localhost:3000/video.mp4")).toBe("http://localhost:3000/video.mp4");
  });

  it("should resolve gs:// URIs to public https URLs", () => {
    expect(resolvePublicUrl("gs://my-bucket/folder/file.png")).toBe(
      "https://storage.googleapis.com/my-bucket/folder/file.png",
    );
  });

  it("should handle undefined or empty string by returning empty string", () => {
    expect(resolvePublicUrl("")).toBe("");
  });
});

describe("entityTypeOf", () => {
  it('should return "scene" for scope with sceneIds', () => {
    const scope = { projectId: "proj-1", sceneIds: ["scene-1"] };
    expect(entityTypeOf(scope)).toBe("scene");
  });

  it('should return "character" for scope with characterIds', () => {
    const scope = { projectId: "proj-1", characterIds: ["char-1"] };
    expect(entityTypeOf(scope)).toBe("character");
  });

  it('should return "location" for scope with locationIds', () => {
    const scope = { projectId: "proj-1", locationIds: ["loc-1"] };
    expect(entityTypeOf(scope)).toBe("location");
  });

  it('should return "file" for scope with fileIds', () => {
    const scope: Scope = { projectId: "proj-1", fileIds: ["img-1"] };
    expect(entityTypeOf(scope)).toBe("file");
  });

  it('should return "project" for scope with only projectId', () => {
    const scope = { projectId: "proj-1" };
    expect(entityTypeOf(scope)).toBe("project");
  });
});

describe("entityIdAt", () => {
  it('should return column "sceneId" and ids for sceneIds scope', () => {
    const scope = { projectId: "proj-1", sceneIds: ["scene-1", "scene-2"] };
    const result = entityIdAt(scope);
    expect(result.column).toBe("sceneId");
    expect(result.ids).toEqual(["scene-1", "scene-2"]);
  });

  it('should return column "characterId" and ids for characterIds scope', () => {
    const scope = { projectId: "proj-1", characterIds: ["char-1"] };
    const result = entityIdAt(scope);
    expect(result.column).toBe("characterId");
    expect(result.ids).toEqual(["char-1"]);
  });

  it('should return column "locationId" and ids for locationIds scope', () => {
    const scope = { projectId: "proj-1", locationIds: ["loc-1", "loc-2", "loc-3"] };
    const result = entityIdAt(scope);
    expect(result.column).toBe("locationId");
    expect(result.ids).toEqual(["loc-1", "loc-2", "loc-3"]);
  });

  it('should return column "fileId" and ids for fileIds scope', () => {
    const scope: Scope = { projectId: "proj-1", fileIds: ["img-1"] };
    const result = entityIdAt(scope);
    expect(result.column).toBe("fileId");
    expect(result.ids).toEqual(["img-1"]);
  });

  it('should return column "projectId" and ids array for project-only scope', () => {
    const scope = { projectId: "proj-1" };
    const result = entityIdAt(scope);
    expect(result.column).toBe("projectId");
    expect(result.ids).toEqual(["proj-1"]);
  });
});
