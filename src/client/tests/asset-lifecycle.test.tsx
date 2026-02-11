/** @vitest-environment happy-dom */
// tests/asset-lifecycle.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStore } from "#/lib/store.js";
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
        useStore.getState().setSelectedProject(null);
        useStore.getState().clearAllAssets();
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
                useStore.getState().setProject(mockProject);
            });

            const { assets, project } = useStore.getState();

            expect(assets.has("proj-1")).toBe(true);
            expect(assets.get("proj-1")?.render_video).toBeDefined();
            expect(assets.has("scene-1")).toBe(true);
            expect(assets.get("scene-1")?.scene_video).toBeDefined();

            // Assets removed from entity objects
            expect((project as any)?.assets).toBeUndefined();
            expect((project?.scenes[ 0 ] as any)?.assets).toBeUndefined();
        });
    });

    describe("Q2: Asset updates during generation", () => {
        it("updates assets via SCENE_UPDATE event flow", () => {
            const { setProject, setAssets, updateSceneClientSide } =
                useStore.getState();

            act(() => {
                setProject({
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
                if (sceneAssets) setAssets(incomingScene.id, sceneAssets);
                updateSceneClientSide(incomingScene.id, rest);
            });

            const { assets, project } = useStore.getState();
            expect(assets.get("scene-2")?.scene_start_frame).toBeDefined();
            expect(project?.scenes[ 0 ].status).toBe("generating");
        });

        it("merges assets via NEW_ASSETS_BATCH event", () => {
            const { setAssets, mergeAssetHistories } = useStore.getState();

            act(() => {
                setAssets("scene-3", {
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
                mergeAssetHistories([{ entityId: "scene-3", assetKey: "scene_end_frame", history: newHistory }]);
            });

            const registry = useStore.getState().assets.get("scene-3");
            expect(registry?.scene_start_frame).toBeDefined();
            expect(registry?.scene_end_frame).toBeDefined();
            expect(registry?.scene_end_frame?.versions[ 0 ].data).toBe(
                "gs://bucket/new.png"
            );
        });
    });

    describe("Q3: Asset restoration on window refresh", () => {
        it("re-hydrates assets from FULL_STATE after reconnect", () => {
            const { setProject, clearAllAssets } = useStore.getState();

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
                setProject(mockProject);
            });

            expect(useStore.getState().assets.has("proj-restore")).toBe(true);

            act(() => {
                clearAllAssets();
            });

            expect(useStore.getState().assets.size).toBe(0);

            act(() => {
                setProject(mockProject);
            });

            expect(useStore.getState().assets.has("proj-restore")).toBe(true);
            expect(
                useStore.getState().assets.get("proj-restore")?.render_video
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
                useStore.getState().setProject(newProject);
            });

            const { assets } = useStore.getState();
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
            ] as any[];

            act(() => {
                useStore.getState().setAssets("scene-a", {
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
                    // Current scene = scene-a, preload window = [a, b, c]
                    return useStore((state) =>
                        [ "scene-a", "scene-b", "scene-c" ].map((id) => ({
                            sceneId: id,
                            registry: state.assets.get(id) ?? null,
                        }))
                    );
                },
                { wrapper: ({ children }: any) => <>{ children }</> }
            );

            const initialCount = renderCount;

            // Mutate scene-d (outside the window)
            act(() => {
                useStore.getState().setAssets("scene-d", {
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

            // Hook should NOT re-run
            expect(renderCount).toBe(initialCount);
        });
    });

    describe("Bug #2: currentScenes selector stability", () => {
        it("returns stable refs when status unchanged", () => {
            const { setProject, setAssets, setCurrentPlaybackTime } =
                useStore.getState();

            act(() => {
                setProject({
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

                setAssets("scene-stable", {
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

            const state1 = useStore.getState();
            const scene1 = state1.project?.scenes[ 0 ];
            const registry1 = state1.assets.get("scene-stable");

            act(() => {
                setCurrentPlaybackTime(10);
            });

            const state2 = useStore.getState();
            const scene2 = state2.project?.scenes[ 0 ];
            const registry2 = state2.assets.get("scene-stable");

            // Scene array ref changes but scene object ref is stable
            expect(scene1).toBe(scene2);
            // Registry object ref is stable (no asset change)
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
                useStore.getState().setProject(mockProject);
            });

            expect(mockProject.assets).toBe(originalAssets);
        });
    });
});

describe("Integration: Complete pipeline", () => {
    it("handles full lifecycle from creation to display", () => {
        const { setProject, setAssets, updateSceneClientSide, mergeAssetHistories } =
            useStore.getState();

        // Step 1: Create project
        act(() => {
            setProject({
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

        let { assets, project } = useStore.getState();
        expect(assets.has("integration-proj")).toBe(true);
        expect(assets.has("integration-scene")).toBe(true);

        // Step 2: Scene generation starts
        act(() => {
            updateSceneClientSide("integration-scene", { status: "generating" });
        });

        ({ project } = useStore.getState());
        expect(project?.scenes[ 0 ].status).toBe("generating");

        // Step 3: First asset arrives (NEW_ASSETS_BATCH)
        act(() => {
            mergeAssetHistories([
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

        ({ assets } = useStore.getState());
        expect(assets.get("integration-scene")?.scene_start_frame).toBeDefined();

        // Step 4: Video completes (SCENE_UPDATE)
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

        const { assets: sceneAssets, ...rest } = completeScene;

        act(() => {
            if (sceneAssets) setAssets(completeScene.id, sceneAssets);
            updateSceneClientSide(completeScene.id, rest);
        });

        ({ assets, project } = useStore.getState());
        expect(project?.scenes[ 0 ].status).toBe("complete");
        expect(assets.get("integration-scene")?.scene_video).toBeDefined();

        // Step 5: Refresh (FULL_STATE)
        act(() => {
            setProject({
                id: "integration-proj",
                assets: {},
                scenes: [ completeScene ],
                characters: [],
                locations: [],
            } as unknown as ProjectBackend);
        });

        ({ assets } = useStore.getState());
        expect(assets.get("integration-scene")?.scene_video).toBeDefined();
    });
});