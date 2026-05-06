import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAssetStore } from "#client/store/useAssetStore.js";
import { AssetKey } from "#shared/types/assets.types.js";

describe("useAssetStore", () => {
  beforeEach(() => {
    useAssetStore.getState().clearAllAssets();
  });

  describe("mergeAssetHistories", () => {
    it("should merge versions from new history with existing", () => {
      const { result } = renderHook(() => useAssetStore());

      const entityId = "scene-1";
      const assetKey: AssetKey = "scene_start_frame";

      const oldVersion = {
        version: 1,
        data: "old-url",
        type: "image" as const,
        metadata: { model: "old-model", jobId: "" },
        startedAt: new Date("2024-01-01"),
        createdAt: new Date("2024-01-01"),
      };

      act(() => {
        result.current.setAssets(entityId, {
          [assetKey]: {
            head: 1,
            best: 1,
            versions: [oldVersion],
          },
        });
      });

      const newVersion = {
        version: 2,
        data: "new-url",
        type: "image" as const,
        metadata: { model: "new-model", jobId: "" },
        startedAt: new Date("2024-01-02"),
        createdAt: new Date("2024-01-02"),
      };

      act(() => {
        result.current.mergeAssetHistories([
          {
            entityId,
            assetKey,
            history: {
              head: 2,
              best: 2,
              versions: [newVersion],
            },
          },
        ]);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets?.[assetKey]?.versions).toHaveLength(2);
      expect(assets?.[assetKey]?.versions[0].version).toBe(1);
      expect(assets?.[assetKey]?.versions[1].version).toBe(2);
      expect(assets?.[assetKey]?.head).toBe(2);
      expect(assets?.[assetKey]?.best).toBe(2);
    });

    it("should preserve other asset keys when merging", () => {
      const { result } = renderHook(() => useAssetStore());

      const entityId = "scene-1";
      const assetKey1: AssetKey = "scene_start_frame";
      const assetKey2: AssetKey = "scene_end_frame";

      act(() => {
        result.current.setAssets(entityId, {
          [assetKey1]: {
            head: 1,
            best: 1,
            versions: [
              {
                version: 1,
                data: "url1",
                type: "image" as const,
                metadata: { model: "", jobId: "" },
                startedAt: new Date(),
                createdAt: new Date(),
              },
            ],
          },
          [assetKey2]: {
            head: 1,
            best: 1,
            versions: [
              {
                version: 1,
                data: "url2",
                type: "image" as const,
                metadata: { model: "", jobId: "" },
                startedAt: new Date(),
                createdAt: new Date(),
              },
            ],
          },
        });
      });

      act(() => {
        result.current.mergeAssetHistories([
          {
            entityId,
            assetKey: assetKey1,
            history: {
              head: 2,
              best: 2,
              versions: [
                {
                  version: 2,
                  data: "new-url1",
                  type: "image" as const,
                  metadata: { model: "", jobId: "" },
                  startedAt: new Date(),
                  createdAt: new Date(),
                },
              ],
            },
          },
        ]);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets?.[assetKey1]?.versions).toHaveLength(2);
      expect(assets?.[assetKey2]?.head).toBe(1);
      expect(assets?.[assetKey2]?.versions).toHaveLength(1);
    });
  });

  describe("mergeAssets", () => {
    it("should merge registries preserving existing keys", () => {
      const { result } = renderHook(() => useAssetStore());

      const entityId = "scene-1";

      // Set initial state
      act(() => {
        result.current.setAssets(entityId, {
          scene_start_frame: {
            head: 1,
            best: 1,
            versions: [
              {
                version: 1,
                data: "url1",
                type: "image" as const,
                metadata: { model: "", jobId: "" },
                startedAt: new Date(),
                createdAt: new Date(),
              },
            ],
          },
        });
      });

      // Merge new registry with additional key
      const newRegistry = {
        scene_end_frame: {
          head: 1,
          best: 1,
          versions: [
            {
              version: 1,
              data: "url2",
              type: "image" as const,
              metadata: { model: "", jobId: "" },
              startedAt: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      };

      act(() => {
        result.current.mergeAssets(entityId, newRegistry);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets).toEqual(
        expect.objectContaining({
          scene_start_frame: expect.objectContaining({
            head: 1,
            best: 1,
            versions: [expect.objectContaining({ version: 1, data: "url1", type: "image" })],
          }),
          scene_end_frame: expect.objectContaining({
            head: 1,
            best: 1,
            versions: [expect.objectContaining({ version: 1, data: "url2", type: "image" })],
          }),
        }),
      );
    });

    it("should handle conflicting keys by merging histories", () => {
      const { result } = renderHook(() => useAssetStore());

      const entityId = "scene-1";
      const assetKey: AssetKey = "scene_start_frame";

      // Set initial state
      act(() => {
        result.current.setAssets(entityId, {
          [assetKey]: {
            head: 1,
            best: 1,
            versions: [
              {
                version: 1,
                data: "url1",
                type: "image" as const,
                metadata: { model: "", jobId: "" },
                startedAt: new Date(),
                createdAt: new Date(),
              },
            ],
          },
        });
      });

      // Merge registry with conflicting key
      const newRegistry = {
        [assetKey]: {
          head: 2,
          best: 2,
          versions: [
            {
              version: 1,
              data: "url1",
              type: "image" as const,
              metadata: { model: "", jobId: "" },
              startedAt: new Date(),
              createdAt: new Date(),
            },
            {
              version: 2,
              data: "url2",
              type: "image" as const,
              metadata: { model: "", jobId: "" },
              startedAt: new Date(),
              createdAt: new Date(),
            },
          ],
        },
      };

      act(() => {
        result.current.mergeAssets(entityId, newRegistry);
      });

      const assets = result.current.assets.get(entityId);
      expect(assets?.[assetKey]).toEqual(
        expect.objectContaining({
          head: 2,
          best: 2,
          versions: expect.arrayContaining([
            expect.objectContaining({ version: 1, data: "url1" }),
            expect.objectContaining({ version: 2, data: "url2" }),
          ]),
        }),
      );
    });
  });
});
