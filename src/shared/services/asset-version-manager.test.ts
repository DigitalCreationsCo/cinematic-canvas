// shared/services/asset-version-manager.test.ts
import { db } from '../db/index';
import { assetEntries, assetVersions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AssetVersionManager } from './asset-version-manager.js';
import { ProjectRepository } from './project-repository.js';
import type {
    AssetHistory,
    AssetVersion,
    AssetKey,
    Scope,
    Scene,
    Character,
    Location,
    Project,
    EntityType,
    AssetType, 
} from '../types/index';
import { createMockDb, createMockRepository } from '../mocks/mock-db.js';
import { createCharacterScope, createHistoryWithVersions, createLocationScope, createProjectScope, createSceneScope } from "../mocks/mock-assets.js"

vi.mock('./project-repository.js');

// ============================================================================
// TESTS: Asset Creation
// ============================================================================

describe('AssetVersionManager - Asset Creation', () => {
    let manager: AssetVersionManager;
    let mockRepo: ProjectRepository;
    let mockDb: any;

    beforeEach(() => {
        mockDb = createMockDb();
        mockRepo = createMockRepository();
        manager = new AssetVersionManager(mockRepo);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('createVersionedAssets', () => {
        it('should create first version with version number 1', async () => {
            const scope = createProjectScope('proj-1');
            const assetKeys: AssetKey[] = ['scene_video'];
            const dataList = ['data:image/png;base64,abc123'];
            const metadata = [{ jobId: 'job-1', model: 'test-model' }];

            // Mock empty history (no versions yet)
            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: {},
            } as any);

            vi.spyOn(mockRepo, 'getProjectWithLock').mockResolvedValue({
                id: 'proj-1',
                assets: {},
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            const result = await manager.createVersionedAssets(
                scope,
                assetKeys,
                'image',
                dataList,
                metadata,
                true
            );

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual({
                head: 1,
                best: 1,
                versions: [
                    expect.objectContaining({
                        version: 1,
                        type: 'image',
                        data: 'data:image/png;base64,abc123',
                        metadata: { jobId: 'job-1', model: 'test-model' },
                    }),
                ],
            });

            // Verify updateAssetsForTable called correctly
            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    expect.objectContaining({
                        entityId: 'proj-1',
                        assetKey: 'scene_video',
                        history: expect.objectContaining({
                            head: 1,
                            best: 1,
                        }),
                    }),
                ]),
                expect.anything()
            );
        });

        it('should increment version number when adding to existing history', async () => {
            const scope = createProjectScope('proj-1');
            const existingHistory = createHistoryWithVersions(2);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: existingHistory },
            } as any);

            vi.spyOn(mockRepo, 'getProjectWithLock').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: existingHistory },
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            const result = await manager.createVersionedAssets(
                scope,
                ['scene_video'],
                'image',
                ['data:image/png;base64,new'],
                [{ jobId: 'job-3', model: 'test-model' }],
                false // Don't set as best
            );

            expect(result[0]).toEqual({
                head: 3,
                best: 2, // Best stays at 2
                versions: [
                    ...existingHistory.versions,
                    expect.objectContaining({
                        version: 3,
                        metadata: { jobId: 'job-3', model: 'test-model' },
                    }),
                ],
            });
        });

        it('should auto-set first version as best when best is 0', async () => {
            const scope = createProjectScope('proj-1');
            
            vi.spyOn(mockRepo, 'getProjectWithLock').mockResolvedValue({
                id: 'proj-1',
                assets: {},
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            const result = await manager.createVersionedAssets(
                scope,
                ['scene_video'],
                'image',
                ['data:image/png;base64,first'],
                [{ jobId: 'job-4', model: 'test-model' }],
                false // Even with false, first version should be best
            );

            expect(result[0].best).toBe(1);
        });

        it('should handle multiple scenes with polymorphic assetKeys', async () => {
            const scope = createSceneScope('proj-1', ['scene-1', 'scene-2', 'scene-3']);
            
            vi.spyOn(mockRepo, 'getProjectScenes').mockResolvedValue([
                { id: 'scene-1', assets: {} },
                { id: 'scene-2', assets: {} },
                { id: 'scene-3', assets: {} },
            ] as any);

            vi.spyOn(mockRepo, 'getScenesWithLock').mockResolvedValue([
                { id: 'scene-1', assets: {} },
                { id: 'scene-2', assets: {} },
                { id: 'scene-3', assets: {} },
            ] as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            // Single key - should broadcast to all scenes
            const result = await manager.createVersionedAssets(
                scope,
                ['scene_video'], // Single key
                'image',
                ['data1', 'data2', 'data3'],
                [{ jobId: 'job-5', model: 'test-model' }, { jobId: 'job-6', model: 'test-model' }, { jobId: 'job-7', model: 'test-model' }],
                true
            );

            expect(result).toHaveLength(3);
            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    expect.objectContaining({ assetKey: 'scene_video' }),
                    expect.objectContaining({ assetKey: 'scene_video' }),
                    expect.objectContaining({ assetKey: 'scene_video' }),
                ]),
                expect.anything()
            );
        });

        it('should handle per-entity assetKeys', async () => {
            const scope = createSceneScope('proj-1', ['scene-1', 'scene-2']);
            
            vi.spyOn(mockRepo, 'getProjectScenes').mockResolvedValue([
                { id: 'scene-1', assets: {} },
                { id: 'scene-2', assets: {} },
            ] as any);

            vi.spyOn(mockRepo, 'getScenesWithLock').mockResolvedValue([
                { id: 'scene-1', assets: {} },
                { id: 'scene-2', assets: {} },
            ] as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            await manager.createVersionedAssets(
                scope,
                ['scene_start_frame', 'scene_end_frame'], // Different keys per scene
                'image',
                ['data1', 'data2'],
                [{}, {}] as any[],
                true
            );

            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    expect.objectContaining({ assetKey: 'start_frame' }),
                    expect.objectContaining({ assetKey: 'end_frame' }),
                ]),
                expect.anything()
            );
        });

        it('should validate input length matches scope', async () => {
            const scope = createSceneScope('proj-1', ['scene-1', 'scene-2']);

            await expect(
                manager.createVersionedAssets(
                    scope,
                    ['scene_video'],
                    'image',
                    ['data1'], // Only 1 data item for 2 scenes!
                    [{}] as any[],
                    true
                )
            ).rejects.toThrow('Scene scope expects 2 data item(s), got 1');
        });
    });

    describe('batchCreateVersionedAssets', () => {
        it('should handle multiple operations successfully', async () => {
            const scope1 = createProjectScope('proj-1');
            const scope2 = createProjectScope('proj-2');

            vi.spyOn(mockRepo, 'getProjectWithLock')
                .mockResolvedValueOnce({ id: 'proj-1', assets: {} } as any)
                .mockResolvedValueOnce({ id: 'proj-2', assets: {} } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            const result = await manager.batchCreateVersionedAssets([
                [scope1, ['scene_video'], 'video', ['data1'], [{}] as any[], true],
            ]);

            expect(result.histories).toHaveLength(2);
            expect(result.errors).toHaveLength(0);
        });

        it('should collect errors without failing entire batch', async () => {
            const scope1 = createProjectScope('proj-1');
            const scope2 = createProjectScope('proj-2');

            vi.spyOn(mockRepo, 'getProjectWithLock')
                .mockResolvedValueOnce({ id: 'proj-1', assets: {} } as any)
                .mockRejectedValueOnce(new Error('Database error'));

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            const result = await manager.batchCreateVersionedAssets([
                [scope1, ['scene_video'], 'video', ['data1'], [{}] as any[], true],
            ]);

            expect(result.histories).toHaveLength(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].index).toBe(1);
        });
    });
});

// ============================================================================
// TESTS: Version Management
// ============================================================================

describe('AssetVersionManager - Version Management', () => {
    let manager: AssetVersionManager;
    let mockRepo: ProjectRepository;

    beforeEach(() => {
        const mockDb = createMockDb();
        mockRepo = createMockRepository(mockDb);
        manager = new AssetVersionManager(mockRepo);
    });

    describe('setBestVersion', () => {
        it('should update best pointer to existing version', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            await manager.setBestVersion(scope, ['scene_video'], [2]);

            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    expect.objectContaining({
                        history: expect.objectContaining({ best: 2 }),
                    }),
                ]),
                expect.anything()
            );
        });

        it('should allow setting best to 0 (no best version)', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            await manager.setBestVersion(scope, ['scene_video'], [0]);

            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    expect.objectContaining({
                        history: expect.objectContaining({ best: 0 }),
                    }),
                ]),
                expect.anything()
            );
        });

        it('should reject non-existent version numbers', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            await expect(
                manager.setBestVersion(scope, ['scene_video'], [99])
            ).rejects.toThrow('Version 99 does not exist');
        });

        it('should validate all versions before making any changes', async () => {
            const scope = createSceneScope('proj-1', ['scene-1', 'scene-2']);

            vi.spyOn(mockRepo, 'getProjectScenes').mockResolvedValue([
                { id: 'scene-1', assets: { video: createHistoryWithVersions(3) } },
                { id: 'scene-2', assets: { video: createHistoryWithVersions(2) } },
            ] as any);

            // Second version doesn't exist, should fail before any updates
            await expect(
                manager.setBestVersion(scope, ['scene_video'], [2, 99])
            ).rejects.toThrow('Version 99 does not exist');

            // No updates should have been attempted
            expect(mockRepo.updateAssetsForTable).not.toHaveBeenCalled();
        });
    });

    describe('updateVersionMetadata', () => {
        it('should merge metadata into specific version', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(2);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            await manager.updateVersionMetadata(
                scope,
                ['scene_video'],
                2,
                { evaluation: {} as any }
            );

            const call = vi.mocked(mockRepo.updateAssetsForTable).mock.calls[0];
            const updatedHistory = call[1][0].history;

            expect(updatedHistory.versions[1].metadata).toEqual(
                expect.objectContaining({
                    jobId: 'job-2',
                    evaluationScore: 0.95,
                })
            );
        });

        it('should preserve immutability - not modify other versions', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);
            const originalV1Metadata = { ...history.versions[0].metadata };

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            await manager.updateVersionMetadata(
                scope,
                ['scene_video'],
                2,
                { evaluation: {} as any }
            );

            const call = vi.mocked(mockRepo.updateAssetsForTable).mock.calls[0];
            const updatedHistory = call[1][0].history;

            // Version 1 should be unchanged
            expect(updatedHistory.versions[0].metadata).toEqual(originalV1Metadata);
        });

        it('should skip entities where version does not exist', async () => {
            const scope = createSceneScope('proj-1', ['scene-1', 'scene-2']);

            vi.spyOn(mockRepo, 'getProjectScenes').mockResolvedValue([
                { id: 'scene-1', assets: { video: createHistoryWithVersions(3) } },
                { id: 'scene-2', assets: { video: createHistoryWithVersions(1) } }, // No v2
            ] as any);

            vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

            await manager.updateVersionMetadata(
                scope,
                ['scene_video'],
                2,
                { evaluation: {} as any }
            );

            // Should only update scene-1
            expect(mockRepo.updateAssetsForTable).toHaveBeenCalledWith(
                expect.anything(),
                expect.arrayContaining([
                    expect.objectContaining({ entityId: 'scene-1' }),
                ]),
                expect.anything()
            );
        });
    });
});

// ============================================================================
// TESTS: Read Queries
// ============================================================================

describe('AssetVersionManager - Read Queries', () => {
    let manager: AssetVersionManager;
    let mockRepo: ProjectRepository;

    beforeEach(() => {
        const mockDb = createMockDb();
        mockRepo = createMockRepository(mockDb);
        manager = new AssetVersionManager(mockRepo);
    });

    describe('getNextVersionNumber', () => {
        it('should return 1 for empty history', async () => {
            const scope = createProjectScope('proj-1');

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: {},
            } as any);

            const result = await manager.getNextVersionNumber(scope, ['scene_video']);

            expect(result).toEqual([1]);
        });

        it('should return head + 1 for existing history', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(5);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            const result = await manager.getNextVersionNumber(scope, ['scene_video']);

            expect(result).toEqual([6]);
        });
    });

    describe('getBestVersion', () => {
        it('should return null when best is 0', async () => {
            const scope = createProjectScope('proj-1');
            const history = { ...createHistoryWithVersions(3), best: 0 };

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            const result = await manager.getBestVersion(scope, ['scene_video']);

            expect(result).toEqual([null]);
        });

        it('should return the version marked as best', async () => {
            const scope = createProjectScope('proj-1');
            const history = { ...createHistoryWithVersions(3), best: 2 };

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            const result = await manager.getBestVersion(scope, ['scene_video']);

            expect(result[0]).toEqual(
                expect.objectContaining({
                    version: 2,
                    metadata: { jobId: 'job-2' },
                })
            );
        });

        it('should return null when versions array is empty', async () => {
            const scope = createProjectScope('proj-1');

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: { head: 0, best: 0, versions: [] } },
            } as any);

            const result = await manager.getBestVersion(scope, ['scene_video']);

            expect(result).toEqual([null]);
        });
    });

    describe('getAllVersions', () => {
        it('should return all versions sorted newest first', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            const result = await manager.getAllVersions(scope, ['scene_video']);

            expect(result[0]).toHaveLength(3);
            expect(result[0][0].version).toBe(3); // Newest first
            expect(result[0][1].version).toBe(2);
            expect(result[0][2].version).toBe(1);
        });
    });

    describe('getVersionByNumber', () => {
        it('should return specific version', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            const result = await manager.getVersionByNumber(scope, ['scene_video'], [2]);

            expect(result[0]).toEqual(
                expect.objectContaining({
                    version: 2,
                    metadata: { jobId: 'job-2' },
                })
            );
        });

        it('should return null for non-existent version', async () => {
            const scope = createProjectScope('proj-1');
            const history = createHistoryWithVersions(3);

            vi.spyOn(mockRepo, 'getProject').mockResolvedValue({
                id: 'proj-1',
                assets: { scene_video: history },
            } as any);

            const result = await manager.getVersionByNumber(scope, ['scene_video'], [99]);

            expect(result).toEqual([null]);
        });
    });
});

// ============================================================================
// TESTS: Critical Bug Scenarios
// ============================================================================

describe('AssetVersionManager - Bug Prevention', () => {
    let manager: AssetVersionManager;
    let mockRepo: ProjectRepository;

    beforeEach(() => {
        const mockDb = createMockDb();
        mockRepo = createMockRepository(mockDb);
        manager = new AssetVersionManager(mockRepo);
    });

    it('BUG FIX: should not duplicate versions when updating', async () => {
        const scope = createProjectScope('proj-1');
        const existingHistory = createHistoryWithVersions(2);

        vi.spyOn(mockRepo, 'getProjectWithLock').mockResolvedValue({
            id: 'proj-1',
            assets: { scene_video: existingHistory },
        } as any);

        vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

        // Add third version
        await manager.createVersionedAssets(
            scope,
            ['scene_video'],
            'image',
            ['data:image/png;base64,v3'],
            [{ jobId: 'job-3', model: 'test-model' }],
            true
        );

        const updateCall = vi.mocked(mockRepo.updateAssetsForTable).mock.calls[0];
        const updatedHistory = updateCall[1][0].history;

        // CRITICAL: Should have exactly 3 versions, not [v1, v2, v1, v2, v3]
        expect(updatedHistory.versions).toHaveLength(3);
        expect(updatedHistory.versions.map(v => v.version)).toEqual([1, 2, 3]);
    });

    it('BUG FIX: updateAssetsForTable should use single atomic UPDATE', async () => {
        const mockTable = {} as any;
        const operations = [
            {
                entityId: 'entity-1',
                entityType: 'scene' as EntityType,
                assetKey: 'video' as AssetKey,
                history: createHistoryWithVersions(1),
            },
        ];

        const mockTx = {
            update: vi.fn(() => mockTx),
            set: vi.fn(() => mockTx),
            where: vi.fn(() => Promise.resolve()),
        };

        await mockRepo.updateAssetsForTable(mockTable, operations, mockTx as any);

        // Should call update exactly once per entity (not 3 times)
        expect(mockTx.update).toHaveBeenCalledTimes(1);
    });

    it('BUG FIX: should handle concurrent updates with transaction isolation', async () => {
        const scope = createProjectScope('proj-1');
        
        vi.spyOn(mockRepo, 'getProjectWithLock').mockResolvedValue({
            id: 'proj-1',
            assets: {},
        } as any);

        vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

        // Simulate two concurrent requests
        const promise1 = manager.createVersionedAssets(
            scope,
            ['scene_video'],
            'video',
            ['data1'],
            [{}],
            true
        );

        const promise2 = manager.createVersionedAssets(
            scope,
            ['scene_video'],
            'audio',
            ['data2'],
            [{}],
            true
        );

        const [result1, result2] = await Promise.all([promise1, promise2]);

        // Both should succeed with correct version numbers
        expect(result1[0].head).toBe(1);
        expect(result2[0].head).toBe(1);
    });
});

// ============================================================================
// TESTS: Entity Type Coverage
// ============================================================================

describe('AssetVersionManager - All Entity Types', () => {
    let manager: AssetVersionManager;
    let mockRepo: ProjectRepository;

    beforeEach(() => {
        const mockDb = createMockDb();
        mockRepo = createMockRepository();
        manager = new AssetVersionManager(mockRepo);
    });

    it('should handle project scope', async () => {
        const scope = createProjectScope('proj-1');

        vi.spyOn(mockRepo, 'getProjectWithLock').mockResolvedValue({
            id: 'proj-1',
            assets: {},
        } as any);

        vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

        await manager.createVersionedAssets(
            scope,
            ['location_image'],
            'audio',
            ['data1'],
            [{}],
            true
        );

        expect(mockRepo.updateAssetsForTable).toHaveBeenCalled();
    });

    it('should handle scene scope', async () => {
        const scope = createSceneScope('proj-1', ['scene-1']);

        vi.spyOn(mockRepo, 'getProjectScenes').mockResolvedValue([
            { id: 'scene-1', assets: {} },
        ] as any);

        vi.spyOn(mockRepo, 'getScenesWithLock').mockResolvedValue([
            { id: 'scene-1', assets: {} },
        ] as any);

        vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

        await manager.createVersionedAssets(
            scope,
            ['scene_video'],
            'video',
            ['data1'],
            [{}],
            true
        );

        expect(mockRepo.updateAssetsForTable).toHaveBeenCalled();
    });

    it('should handle character scope', async () => {
        const scope = createCharacterScope('proj-1', ['char-1']);

        vi.spyOn(mockRepo, 'getProjectCharacters').mockResolvedValue([
            { id: 'char-1', assets: {} },
        ] as any);

        vi.spyOn(mockRepo, 'getCharactersWithLock').mockResolvedValue([
            { id: 'char-1', assets: {} },
        ] as any);

        vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

        await manager.createVersionedAssets(
            scope,
            ['character_image'],
            'image',
            ['data1'],
            [{}],
            true
        );

        expect(mockRepo.updateAssetsForTable).toHaveBeenCalled();
    });

    it('should handle location scope', async () => {
        const scope = createLocationScope('proj-1', ['loc-1']);

        vi.spyOn(mockRepo, 'getProjectLocations').mockResolvedValue([
            { id: 'loc-1', assets: {} },
        ] as any);

        vi.spyOn(mockRepo, 'getLocationsWithLock').mockResolvedValue([
            { id: 'loc-1', assets: {} },
        ] as any);

        vi.spyOn(mockRepo, 'updateAssetsForTable').mockResolvedValue(undefined);

        await manager.createVersionedAssets(
            scope,
            ['location_image'],
            'image',
            ['data1'],
            [{}],
            true
        );

        expect(mockRepo.updateAssetsForTable).toHaveBeenCalled();
    });
});

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

describe('AssetVersionManager - saveAssetHistories (100% Coverage)', () => {
    let manager: AssetVersionManager;
    const mockScope = { projectId: 'p1', characterIds: [ 'char-1' ] };

    beforeEach(() => {
        manager = new AssetVersionManager();
        vi.clearAllMocks();
    });

    /**
     * TEST 1: The Original Bug Fix (Batch Internal Duplicates)
     * Ensures that if we send 4 images for 1 character, it doesn't crash
     * and versions them 1, 2, 3, 4 sequentially.
     */
    it('should handle multiple versions for the same asset key in a single batch', async () => {
        const assetKeys = [ 'character_image', 'character_image' ];
        const dataList = [ 'url-v1', 'url-v2' ];
        const type = 'character_image';

        // Execute the call
        const results = await manager.createVersionedAssets(
            mockScope,
            assetKeys,
            type,
            dataList,
            {}, // empty metadata
            true // setBest
        );

        // Assertions
        expect(results).toHaveLength(2);

        // Check internal sequence
        expect(results[ 0 ].head).toBe(1);
        expect(results[ 1 ].head).toBe(2);
        expect(results[ 1 ].best).toBe(2);

        // Verify DB State
        const entries = await db.select().from(assetEntries)
            .where(eq(assetEntries.characterId, 'char-1'));

        expect(entries).toHaveLength(1); // Only ONE entry record created
        expect(entries[ 0 ].head).toBe(2);

        const versions = await db.select().from(assetVersions)
            .where(eq(assetVersions.assetEntryId, entries[ 0 ].id));
        expect(versions).toHaveLength(2);
    });

    /**
     * TEST 2: Incremental Growth
     * Ensures that if a version already exists, we start from that head.
     */
    it('should increment version correctly based on existing DB state', async () => {
        // 1. Manually seed an entry at version 5
        const [ existingEntry ] = await db.insert(assetEntries).values({
            id: crypto.randomUUID(),
            projectId: 'p1',
            characterId: 'char-1',
            assetKey: 'character_image',
            head: 5,
            best: 1
        }).returning();

        // 2. Add two more via manager
        const results = await manager.createVersionedAssets(
            mockScope,
            [ 'character_image', 'character_image' ],
            'character_image',
            [ 'v6', 'v7' ]
        );

        expect(results[ 0 ].head).toBe(6);
        expect(results[ 1 ].head).toBe(7);
    });

    /**
     * TEST 3: Best Logic
     * Ensures "best" pointer logic respects the setBest flag.
     */
    it('should only update "best" when flag is true or no best exists', async () => {
        const results = await manager.createVersionedAssets(
            mockScope,
            [ 'character_image' ],
            'character_image',
            [ 'data' ],
            {},
            false // setBest is false
        );

        // On first insert, even if false, it should become best because best was 0
        expect(results[ 0 ].best).toBe(1);

        const secondResults = await manager.createVersionedAssets(
            mockScope,
            [ 'character_image' ],
            'character_image',
            [ 'data' ],
            {},
            false // still false
        );

        // Should stay 1
        expect(secondResults[ 0 ].best).toBe(1);
        expect(secondResults[ 0 ].head).toBe(2);
    });

    /**
     * TEST 4: Transactional Integrity
     * Ensures that if versions fail to insert, the entry "head" doesn't increment (Atomic).
     */
    it('should roll back entry updates if version insertion fails', async () => {
        // Force an error in the second half of the transaction
        vi.spyOn(manager as any, 'batchInsertVersions').mockRejectedValueOnce(new Error('DB Crash'));

        await expect(
            manager.createVersionedAssets(mockScope, [ 'character_image' ], 'character_image', [ 'data' ])
        ).rejects.toThrow('DB Crash');

        // Verify Entry was NOT created or updated
        const entries = await db.select().from(assetEntries)
            .where(eq(assetEntries.characterId, 'char-1'));
        expect(entries).toHaveLength(0);
    });
});