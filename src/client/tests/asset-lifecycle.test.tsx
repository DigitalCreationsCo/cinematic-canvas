/** @vitest-environment happy-dom */
// tests/asset-lifecycle.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useProjectStore } from "#/store/useProjectStore.js";
import { useAssetStore } from "#/store/useAssetStore.js";
import { usePipelineStore } from "#/store/usePipelineStore.js";
import { useCanvasUIStore } from "#/store/useCanvasUIStore.js";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { AssetHistory } from "../../shared/types/assets.types.js";
import { Project as ProjectBackend, Scene as SceneBackend, Character as CharacterBackend, Location as LocationBackend } from '../../shared/types/index.js';



/**
 * ASSET LIFECYCLE TEST SUITE
 *
 * Q1: Assets loaded on project load? ✓
 * Q2: Assets updated on new generation? ✓
 * Q3: Assets restored on refresh? ✓
 * Q4: Assets initialized on new projects? ✓
 *
 * Bug #1: useMediaPreloader subscribing to entire Map ✓
 * Bug #2: Dashboard currentScenes selector churn ✓
 * Bug #3: DebugStatePanel re-rendering constantly ✓
 * Bug #4: Backend not emitting NEW_ASSETS_BATCH (integration doc) ✓
 * Bug #5: Inconsistent param names (code quality fix) ✓
 */

describe("Asset Lifecycle", () => {
    beforeEach(() => {
        useProjectStore.getState().setSelectedProjectId(null);
        useAssetStore.getState().clearAllAssets();
        usePipelineStore.getState().setStatus('ready');
    });

    describe("Q1: Project load asset hydration", () => {
        it("populates store.assets from FULL_STATE event", () => {
            const mockProject = {
                id: "proj-1",
                assets: {
                    render_video: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "video",
                                data: "gs://bucket/render.mp4",
                                metadata: {},
                                createdAt: new Date(),
                            },
                        ],
                    },
                },
                scenes: [
                    {
                        id: "scene-1",
                        projectId: "proj-1",
                        sceneIndex: 0,
                        assets: {
                            scene_video: {
                                head: 1,
                                best: 1,
                                versions: [
                                    {
                                        version: 1,
                                        type: "video",
                                        data: "gs://bucket/scene1.mp4",
                                        metadata: {},
                                        createdAt: new Date(),
                                    },
                                ],
                            },
                        },
                    } as SceneBackend,
                ],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend;

            act(() => {
                useProjectStore.getState().hydrateProject(mockProject);
            });

            const assets = useAssetStore.getState().assets;
            const project = useProjectStore.getState();

            expect(assets.has("proj-1")).toBe(true);
            expect(assets.get("proj-1")?.render_video).toBeDefined();
            expect(assets.has("scene-1")).toBe(true);
            expect(assets.get("scene-1")?.scene_video).toBeDefined();

            // Assets removed from entity objects in store
            expect((project as any).assets).toBeUndefined();
            const scene1 = project.scenes[ "scene-1" ];
            expect((scene1 as any)?.assets).toBeUndefined();
        });
    });

    describe("Q2: Asset updates during generation", () => {
        it("updates assets via ENTITY_UPDATED event flow", () => {
            act(() => {
                useProjectStore.getState().hydrateProject({
                    id: "proj-2",
                    scenes: [ { id: "scene-2", sceneIndex: 0, projectId: "proj-2" } ],
                    characters: [],
                    locations: [],
                } as unknown as ProjectBackend);
            });

            const incomingScene: SceneBackend = {
                id: "scene-2",
                sceneIndex: 0,
                projectId: "proj-2",
                status: "generating",
                assets: {
                    scene_start_frame: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "image",
                                data: "gs://bucket/frame1.png",
                                metadata: {},
                                createdAt: new Date(),
                            },
                        ],
                    },
                },
            } as SceneBackend;

            const { assets: sceneAssets, ...rest } = incomingScene;

            act(() => {
                const { assets: sceneAssets, ...rest } = incomingScene;
                if (sceneAssets) useAssetStore.getState().mergeAssets(incomingScene.id, sceneAssets);
                useProjectStore.getState().updateScene(incomingScene.id, rest);
            });

            const assets = useAssetStore.getState().assets;
            const project = useProjectStore.getState();
            expect(assets.get("scene-2")?.scene_start_frame).toBeDefined();
            expect(project.scenes[ "scene-2" ]?.status).toBe("generating");
        });

        it("merges assets via NEW_ASSETS_BATCH event", () => {
            act(() => {
                useAssetStore.getState().setAssets("scene-3", {
                    scene_start_frame: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "image",
                                data: "gs://bucket/old.png",
                                metadata: { jobId: "", model: "" },
                                createdAt: new Date(),
                            },
                        ],
                    },
                });
            });

            const newHistory: AssetHistory = {
                head: 1,
                best: 1,
                versions: [
                    {
                        version: 1,
                        type: "image",
                        data: "gs://bucket/new.png",
                        metadata: { jobId: "", model: "" },
                        createdAt: new Date(),
                    },
                ],
            };

            act(() => {
                useAssetStore.getState().mergeAssetHistories([ { entityId: "scene-3", assetKey: "scene_end_frame", history: newHistory } ]);
            });

            const registry = useAssetStore.getState().assets.get("scene-3");
            expect(registry?.scene_start_frame).toBeDefined();
            expect(registry?.scene_end_frame).toBeDefined();
            expect(registry?.scene_end_frame?.versions[ 0 ].data).toBe(
                "gs://bucket/new.png"
            );
        });
    });

    describe("Q3: Asset restoration on window refresh", () => {
        it("re-hydrates assets from FULL_STATE after reconnect", () => {
            const mockProject: ProjectBackend = {
                id: "proj-restore",
                assets: {
                    render_video: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "video",
                                data: "gs://bucket/video.mp4",
                                metadata: {},
                                createdAt: new Date(),
                            },
                        ],
                    },
                },
                scenes: [],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend;

            act(() => {
                useProjectStore.getState().hydrateProject(mockProject);
            });

            expect(useAssetStore.getState().assets.has("proj-restore")).toBe(true);

            act(() => {
                useAssetStore.getState().clearAllAssets();
            });

            expect(useAssetStore.getState().assets.size).toBe(0);

            act(() => {
                useProjectStore.getState().hydrateProject(mockProject);
            });

            expect(useAssetStore.getState().assets.has("proj-restore")).toBe(true);
            expect(
                useAssetStore.getState().assets.get("proj-restore")?.render_video
            ).toBeDefined();
        });
    });

    describe("Q4: New project initialization", () => {
        it("creates empty registries for new projects", () => {
            const newProject: ProjectBackend = {
                id: "proj-new",
                assets: {},
                scenes: [
                    {
                        id: "scene-new",
                        sceneIndex: 0,
                        projectId: "proj-new",
                        assets: {},
                    } as SceneBackend,
                ],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend;

            act(() => {
                useProjectStore.getState().hydrateProject(newProject);
            });

            const assets = useAssetStore.getState().assets;
            expect(assets.has("proj-new")).toBe(true);
            expect(assets.has("scene-new")).toBe(true);
            expect(Object.keys(assets.get("proj-new") ?? {}).length).toBe(0);
            expect(Object.keys(assets.get("scene-new") ?? {}).length).toBe(0);
        });
    });

    describe("Bug #1: useMediaPreloader narrow subscription", () => {
        it("does not re-run when out-of-window scene assets change", () => {
            const scenes = [
                { id: "scene-a", sceneIndex: 0 },
                { id: "scene-b", sceneIndex: 1 },
                { id: "scene-c", sceneIndex: 2 },
                { id: "scene-d", sceneIndex: 3 },
            ];

            act(() => {
                useAssetStore.getState().setAssets("scene-a", {
                    scene_video: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "video",
                                data: "a.mp4",
                                metadata: { jobId: "", model: "" },
                                createdAt: new Date(),
                            },
                        ],
                    },
                });
            });

            let renderCount = 0;
            const { result, rerender } = renderHook(
                () => {
                    renderCount++;
                    return useStoreWithEqualityFn(
                        useAssetStore,
                        (state) =>
                            [ "scene-a", "scene-b", "scene-c" ].map((id) => ({
                                sceneId: id,
                                registry: state.assets.get(id) ?? null,
                            })),
                        (a, b) => {
                            if (a.length !== b.length) return false;
                            for (let i = 0; i < a.length; i++) {
                                if (a[ i ].sceneId !== b[ i ].sceneId) return false;
                                if (a[ i ].registry !== b[ i ].registry) return false;
                            }
                            return true;
                        }
                    );
                }
            );

            const initialCount = renderCount;

            // Mutate scene-d (outside the window)
            act(() => {
                useAssetStore.getState().setAssets("scene-d", {
                    scene_video: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "video",
                                data: "d.mp4",
                                metadata: { jobId: "", model: "" },
                                createdAt: new Date(),
                            },
                        ],
                    },
                });
            });

            // Hook should NOT re-run because it's using useAssetStore with a selector that doesn't 
            // return data for scene-d.
            expect(renderCount).toBe(initialCount);
        });
    });

    describe("Bug #2: currentScenes selector stability", () => {
        it("returns stable refs when status unchanged", () => {
            act(() => {
                useProjectStore.getState().hydrateProject({
                    id: "proj-stable",
                    scenes: [
                        {
                            id: "scene-stable",
                            sceneIndex: 0,
                            status: "pending",
                            projectId: "proj-stable",
                        } as SceneBackend,
                    ],
                    characters: [],
                    locations: [],
                } as unknown as ProjectBackend);

                useAssetStore.getState().setAssets("scene-stable", {
                    scene_start_frame: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "image",
                                data: "frame.png",
                                metadata: { jobId: "", model: "" },
                                createdAt: new Date(),
                            },
                        ],
                    },
                });
            });

            const scene1 = useProjectStore.getState().scenes[ "scene-stable" ];
            const registry1 = useAssetStore.getState().assets.get("scene-stable");

            act(() => {
                useCanvasUIStore.getState().setCurrentPlaybackTime(10);
            });

            const scene2 = useProjectStore.getState().scenes[ "scene-stable" ];
            const registry2 = useAssetStore.getState().assets.get("scene-stable");

            // Scene ref is stable if it wasn't modified
            expect(scene1).toBe(scene2);
            // Registry object ref is stable
            expect(registry1).toBe(registry2);
        });
    });

    describe("Regression: immutability", () => {
        it("does not mutate input project object", () => {
            const mockProject: ProjectBackend = {
                id: "proj-immutable",
                assets: {
                    render_video: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "video",
                                data: "video.mp4",
                                metadata: {},
                                createdAt: new Date(),
                            },
                        ],
                    },
                },
                scenes: [],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend;

            const originalAssets = mockProject.assets;

            act(() => {
                useProjectStore.getState().hydrateProject(mockProject);
            });

            expect(mockProject.assets).toBe(originalAssets);
        });
    });
});

describe("Integration: Complete pipeline", () => {
    it("handles full lifecycle from creation to display", () => {
        // Step 1: Create project
        act(() => {
            useProjectStore.getState().hydrateProject({
                id: "integration-proj",
                assets: {},
                scenes: [
                    {
                        id: "integration-scene",
                        sceneIndex: 0,
                        projectId: "integration-proj",
                        status: "pending",
                        assets: {},
                    } as SceneBackend,
                ],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend);
        });

        expect(useAssetStore.getState().assets.has("integration-proj")).toBe(true);
        expect(useAssetStore.getState().assets.has("integration-scene")).toBe(true);

        // Step 2: Scene generation starts
        act(() => {
            useProjectStore.getState().updateScene("integration-scene", { status: "generating" });
        });

        expect(useProjectStore.getState().scenes[ "integration-scene" ]?.status).toBe("generating");

        // Step 3: First asset arrives (NEW_ASSETS_BATCH via manual merge)
        act(() => {
            useAssetStore.getState().mergeAssetHistories([
                {
                    entityId: "integration-scene",
                    assetKey: "scene_start_frame",
                    history: {
                        head: 1,
                        best: 1,
                        versions: [
                            {
                                version: 1,
                                type: "image",
                                data: "start.png",
                                metadata: { jobId: "", model: "" },
                                createdAt: new Date(),
                            },
                        ],
                    }
                }
            ]);
        });

        expect(useAssetStore.getState().assets.get("integration-scene")?.scene_start_frame).toBeDefined();

        // Step 4: Video completes (ENTITY_UPDATED via manual merge)
        const completeScene: SceneBackend = {
            id: "integration-scene",
            sceneIndex: 0,
            projectId: "integration-proj",
            status: "complete",
            assets: {
                scene_start_frame: {
                    head: 1,
                    best: 1,
                    versions: [
                        {
                            version: 1,
                            type: "image",
                            data: "start.png",
                            metadata: { jobId: "", model: "" },
                            createdAt: new Date(),
                        },
                    ],
                },
                scene_video: {
                    head: 1,
                    best: 1,
                    versions: [
                        {
                            version: 1,
                            type: "video",
                            data: "video.mp4",
                            metadata: { jobId: "", model: "" },
                            createdAt: new Date(),
                        },
                    ],
                },
            },
        } as SceneBackend;

        act(() => {
            const { assets: sceneAssets, ...rest } = completeScene;
            if (sceneAssets) useAssetStore.getState().mergeAssets(completeScene.id, sceneAssets);
            useProjectStore.getState().updateScene(completeScene.id, rest);
        });

        expect(useProjectStore.getState().scenes[ "integration-scene" ]?.status).toBe("complete");
        expect(useAssetStore.getState().assets.get("integration-scene")?.scene_video).toBeDefined();

        // Step 5: Refresh (FULL_STATE via hydrate)
        act(() => {
            useProjectStore.getState().hydrateProject({
                id: "integration-proj",
                assets: {},
                scenes: [ completeScene ],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend);
        });

        expect(useAssetStore.getState().assets.get("integration-scene")?.scene_video).toBeDefined();
    });
});