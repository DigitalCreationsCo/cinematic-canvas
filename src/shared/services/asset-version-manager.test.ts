import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssetVersionManager } from './asset-version-manager.js';
import { ProjectRepository } from './project-repository.js';
import { Scope, AssetKey, AssetType } from '../types/index.js';

vi.mock('./project-repository.js');

describe('AssetVersionManager', () => {
    let assetVersionManager: AssetVersionManager;
    let mockProjectRepo: any;

    beforeEach(() => {
        mockProjectRepo = {
            getScene: vi.fn(),
            getProjectCharacters: vi.fn(),
            getProjectLocations: vi.fn(),
            getProject: vi.fn(),
            updateSceneAssets: vi.fn(),
            updateCharacterAssets: vi.fn(),
            updateLocationAssets: vi.fn(),
            updateProjectAssets: vi.fn(),
        };
        assetVersionManager = new AssetVersionManager(mockProjectRepo as any);
    });

    describe('createVersionedAssets', () => {
        it('should create a new version for a scene scope', async () => {
            const scope: Scope = { projectId: 'p1', sceneIds: [ 's1' ] };
            const assetKey: AssetKey = 'scene_video';
            const type: AssetType = 'video';
            const dataList = [ 'gs://bucket/video.mp4' ];
            const metadata = { model: 'test-model', jobId: 'j1' };

            mockProjectRepo.getScene.mockResolvedValue({
                id: 's1',
                assets: {}
            });

            const versions = await assetVersionManager.createVersionedAssets(
                scope,
                [assetKey],
                type,
                dataList,
                metadata,
                true
            );

            expect(versions).toHaveLength(1);
            expect(versions[ 0 ].versions[ 0 ].version).toBe(1);
            expect(versions[ 0 ].versions[ 0 ].data).toBe('gs://bucket/video.mp4');
            expect(mockProjectRepo.updateSceneAssets).toHaveBeenCalledWith(
                's1',
                [assetKey],
                expect.objectContaining({
                    head: 1,
                    best: 1,
                    versions: expect.arrayContaining([ versions[ 0 ] ])
                })
            );
        });

        it('should increment version if history already exists', async () => {
            const scope: Scope = { projectId: 'p1', sceneIds: [ 's1' ] };
            const assetKey: AssetKey = 'scene_video';
            const type: AssetType = 'video';
            const dataList = [ 'gs://bucket/video-v2.mp4' ];
            const metadata = { model: 'test-model', jobId: 'j2' };

            mockProjectRepo.getScene.mockResolvedValue({
                id: 's1',
                assets: {
                    [ assetKey ]: {
                        head: 1,
                        best: 1,
                        versions: [ { version: 1, data: 'gs://bucket/video-v1.mp4', type: 'video', metadata: {}, createdAt: new Date() } ]
                    }
                }
            });

            const versions = await assetVersionManager.createVersionedAssets(
                scope,
                [assetKey],
                type,
                dataList,
                metadata,
                true
            );

            expect(versions[ 0 ].versions[ 0 ].version).toBe(2);
            expect(mockProjectRepo.updateSceneAssets).toHaveBeenCalledWith(
                's1',
                [assetKey],
                expect.objectContaining({
                    head: 2,
                    best: 2
                })
            );
        });

        it('should handle character scope (multiple entities)', async () => {
            const scope: Scope = { projectId: 'p1', characterIds: [ 'c1', 'c2' ] };
            const assetKey: AssetKey = 'character_image';
            const type: AssetType = 'image';
            const dataList = [ 'gs://bucket/c1.png', 'gs://bucket/c2.png' ];
            const metadata = { model: 'test-model', jobId: 'j3' };

            mockProjectRepo.getProjectCharacters.mockResolvedValue([
                { id: 'c1', assets: {} },
                { id: 'c2', assets: {} }
            ]);

            const versions = await assetVersionManager.createVersionedAssets(
                scope,
                [assetKey],
                type,
                dataList,
                metadata,
                true
            );

            expect(versions).toHaveLength(2);
            expect(versions[ 0 ].versions[ 0 ].version).toBe(1);
            expect(versions[ 1 ].versions[ 0 ].version).toBe(1);
            expect(mockProjectRepo.updateCharacterAssets).toHaveBeenCalledTimes(2);
            expect(mockProjectRepo.updateCharacterAssets).toHaveBeenCalledWith('c1', assetKey, expect.any(Object));
            expect(mockProjectRepo.updateCharacterAssets).toHaveBeenCalledWith('c2', assetKey, expect.any(Object));
        });
    });

    describe('setBestVersion', () => {
        it('should update best version for a project scope', async () => {
            const scope: Scope = { projectId: 'p1' };
            const assetKey: AssetKey = 'storyboard';

            mockProjectRepo.getProject.mockResolvedValue({
                id: 'p1',
                assets: {
                    [ assetKey ]: {
                        head: 5,
                        best: 1,
                        versions: [
                            { version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }, { version: 5 }
                        ].map(v => ({ ...v, data: '', type: 'json', metadata: {}, createdAt: new Date() }))
                    }
                }
            });

            await assetVersionManager.setBestVersion(scope, [assetKey], [ 3 ]);

            expect(mockProjectRepo.updateProjectAssets).toHaveBeenCalledWith(
                'p1',
                assetKey,
                expect.objectContaining({
                    best: 3
                })
            );
        });
    });
});

/**
 * ASSET VERSION MANAGER — POLYMORPHIC assetKeys TESTS
 *
 * Validates the polymorphic assetKeys pattern:
 *   - Single key → broadcast to all entities
 *   - Per-entity keys → zip with entities
 *   - Out-of-bounds access → fallback to [0]
 *
 * Bug coverage:
 *   Bug #1: saveAssetHistories assetKeys[i] access
 *   Bug #2: resolveHistoriesForUpdate flatMap cardinality
 *   Bug #3: resolveHistories flatMap cardinality
 *   Bug #4: setBestVersion assetKeys[i] access
 *   Bug #5: updateVersionMetadata assetKeys[i] access
 *   Bug #6: validateCreateInput scope discriminators
 */

describe("AssetVersionManager Polymorphic assetKeys", () => {
    let manager: AssetVersionManager;
    let mockRepo: any;

    beforeEach(() => {
        mockRepo = {
            getProjectScenes: vi.fn(),
            getProjectCharacters: vi.fn(),
            getProjectLocations: vi.fn(),
            getProject: vi.fn(),
            getScenesWithLock: vi.fn(),
            getCharactersWithLock: vi.fn(),
            getLocationsWithLock: vi.fn(),
            getProjectWithLock: vi.fn(),
            updateAssetsForTable: vi.fn(),
            getScene: vi.fn(),
            getCharactersByIds: vi.fn(),
            getLocationsByIds: vi.fn(),
        };

        manager = new AssetVersionManager(mockRepo);
    });

    // ==========================================================================
    // SINGLE KEY — BROADCAST TO ALL ENTITIES
    // ==========================================================================

    describe("Single assetKey → broadcast to all entities", () => {
        it("getNextVersionNumber with single key for 3 scenes", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "scene-1", "scene-2", "scene-3" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                {
                    id: "scene-1",
                    assets: {
                        scene_video: { head: 2, best: 2, versions: [ {}, {} ] },
                    },
                },
                {
                    id: "scene-2",
                    assets: {
                        scene_video: { head: 1, best: 1, versions: [ {} ] },
                    },
                },
                {
                    id: "scene-3",
                    assets: {}, // No video yet
                },
            ]);

            const assetKeys: AssetKey[] = [ "scene_video" ]; // SINGLE KEY
            const result = await manager.getNextVersionNumber(scope, assetKeys);

            // Should return 3 numbers (one per scene), all for "scene_video"
            expect(result).toEqual([ 3, 2, 1 ]); // next versions
            expect(result.length).toBe(3); // NOT 1, NOT 9
        });

        it("getBestVersion with single key for 2 characters", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                characterIds: [ "char-a", "char-b" ],
            };

            mockRepo.getProjectCharacters.mockResolvedValue([
                {
                    id: "char-a",
                    assets: {
                        character_portrait: {
                            head: 1,
                            best: 1,
                            versions: [ { version: 1, data: "url-a", type: "image" } ],
                        },
                    },
                },
                {
                    id: "char-b",
                    assets: {
                        character_portrait: {
                            head: 2,
                            best: 1,
                            versions: [
                                { version: 1, data: "url-b1", type: "image" },
                                { version: 2, data: "url-b2", type: "image" },
                            ],
                        },
                    },
                },
            ]);

            const assetKeys: AssetKey[] = [ "character_image" ]; // SINGLE KEY
            const result = await manager.getBestVersion(scope, assetKeys);

            expect(result.length).toBe(2); // NOT 1
            expect(result[ 0 ]?.version).toBe(1);
            expect(result[ 1 ]?.version).toBe(1);
        });
    });

    // ==========================================================================
    // PER-ENTITY KEYS — ZIP WITH ENTITIES
    // ==========================================================================

    describe("Multiple assetKeys → zip with entities", () => {
        it("resolveHistories with 3 scenes and 3 different keys", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "scene-1", "scene-2", "scene-3" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                {
                    id: "scene-1",
                    assets: {
                        scene_start_frame: { head: 1, best: 1, versions: [ {} ] },
                    },
                },
                {
                    id: "scene-2",
                    assets: {
                        scene_end_frame: { head: 1, best: 1, versions: [ {} ] },
                    },
                },
                {
                    id: "scene-3",
                    assets: {
                        scene_video: { head: 1, best: 1, versions: [ {} ] },
                    },
                },
            ]);

            const assetKeys: AssetKey[] = [
                "scene_start_frame",
                "scene_end_frame",
                "scene_video",
            ];

            const result = await manager.getNextVersionNumber(scope, assetKeys);

            expect(result.length).toBe(3); // NOT 9 (from flatMap bug)
            expect(result).toEqual([ 2, 2, 2 ]); // Each scene's next version for its key
        });
    });

    // ==========================================================================
    // FALLBACK TO [0] — OUT-OF-BOUNDS ACCESS
    // ==========================================================================

    describe("assetKeys[i] fallback to assetKeys[0]", () => {
        it("3 scenes but only 1 assetKey → all use assetKeys[0]", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "scene-1", "scene-2", "scene-3" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                { id: "scene-1", assets: { scene_video: { head: 1, best: 1, versions: [ {} ] } } },
                { id: "scene-2", assets: { scene_video: { head: 2, best: 2, versions: [ {}, {} ] } } },
                { id: "scene-3", assets: {} },
            ]);

            const assetKeys: AssetKey[] = [ "scene_video" ]; // Length 1, scope has 3

            const result = await manager.getNextVersionNumber(scope, assetKeys);

            expect(result.length).toBe(3);
            expect(result).toEqual([ 2, 3, 1 ]); // All accessed assetKeys[0]
        });

        it("setBestVersion with 2 scenes and 1 assetKey", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "scene-a", "scene-b" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                {
                    id: "scene-a",
                    assets: {
                        scene_video: {
                            head: 2,
                            best: 1,
                            versions: [
                                { version: 1, data: "old", type: "video" },
                                { version: 2, data: "new", type: "video" },
                            ],
                        },
                    },
                },
                {
                    id: "scene-b",
                    assets: {
                        scene_video: {
                            head: 1,
                            best: 0,
                            versions: [ { version: 1, data: "vid", type: "video" } ],
                        },
                    },
                },
            ]);

            const assetKeys: AssetKey[] = [ "scene_video" ]; // Single key
            const versions = [ 2, 1 ]; // Set best for each scene

            mockRepo.updateAssetsForTable.mockResolvedValue(undefined);

            await manager.setBestVersion(scope, assetKeys, versions);

            // Verify the updateOps passed to updateAssetsForTable
            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledTimes(1);
            const updateOps = mockRepo.updateAssetsForTable.mock.calls[ 0 ][ 1 ];

            expect(updateOps.length).toBe(2);
            expect(updateOps[ 0 ].assetKey).toBe("scene_video"); // assetKeys[0]
            expect(updateOps[ 1 ].assetKey).toBe("scene_video"); // assetKeys[1] ?? assetKeys[0]
        });
    });

    // ==========================================================================
    // EDGE CASE — EMPTY assetKeys ARRAY
    // ==========================================================================

    describe("Edge case: empty assetKeys array", () => {
        it("should handle empty assetKeys gracefully", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "scene-1" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                { id: "scene-1", assets: {} },
            ]);

            const assetKeys: AssetKey[] = []; // EMPTY

            const result = await manager.getNextVersionNumber(scope, assetKeys);

            // With polymorphic fallback assetKeys[i] ?? assetKeys[0]:
            // assetKeys[0] is undefined, so we get an empty history
            expect(result.length).toBe(1);
            expect(result[ 0 ]).toBe(1); // head: 0 → next: 1
        });
    });

    // ==========================================================================
    // BUG #6 — VALIDATE CREATE INPUT WITH PLURAL SCOPE
    // ==========================================================================

    describe("Bug #6: validateCreateInput with sceneIds (plural)", () => {
        it("accepts correct count for sceneIds scope", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "s1", "s2", "s3" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                { id: "s1", assets: {} },
                { id: "s2", assets: {} },
                { id: "s3", assets: {} },
            ]);

            mockRepo.getScenesWithLock.mockResolvedValue([
                { id: "s1", assets: {} },
                { id: "s2", assets: {} },
                { id: "s3", assets: {} },
            ]);

            mockRepo.updateAssetsForTable.mockResolvedValue(undefined);

            const assetKeys: AssetKey[] = [ "scene_video" ];
            const dataList = [ "url1", "url2", "url3" ]; // 3 items for 3 scenes

            await expect(
                manager.createVersionedAssets(
                    scope,
                    assetKeys,
                    "video",
                    dataList,
                    [],
                    false
                )
            ).resolves.toBeDefined();
        });

        it("rejects mismatched count for sceneIds scope", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "s1", "s2" ],
            };

            const assetKeys: AssetKey[] = [ "scene_video" ];
            const dataList = [ "url1" ]; // 1 item for 2 scenes — WRONG

            await expect(
                manager.createVersionedAssets(
                    scope,
                    assetKeys,
                    "video",
                    dataList,
                    [],
                    false
                )
            ).rejects.toThrow("Scene scope expects 2 data item(s), got 1");
        });
    });

    // ==========================================================================
    // CARDINALITY REGRESSION TEST
    // ==========================================================================

    describe("Regression: resolveHistories returns correct count", () => {
        it("does NOT return registries.length × assetKeys.length", async () => {
            const scope: Scope = {
                projectId: "proj-1",
                sceneIds: [ "s1", "s2" ],
            };

            mockRepo.getProjectScenes.mockResolvedValue([
                { id: "s1", assets: {} },
                { id: "s2", assets: {} },
            ]);

            const assetKeys: AssetKey[] = [ "final_output", "storyboard", "start_frame_prompt" ]; // 3 keys

            const result = await manager.getNextVersionNumber(scope, assetKeys);

            // OLD BUG: flatMap produced 2 × 3 = 6 histories
            // FIX: map produces 2 histories (one per scene)
            expect(result.length).toBe(2); // NOT 6
        });
    });
});