import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAssetStore } from '../useAssetStore.js';
import { AssetHistory, AssetKey } from '../../../../shared/types/assets.types.js';

describe('useAssetStore', () => {
    beforeEach(() => {
        useAssetStore.getState().clearAllAssets();
    });

    describe('mergeAssetHistories', () => {
        it('should replace entire history for asset key', () => {
            const { result } = renderHook(() => useAssetStore());

            const entityId = 'scene-1';
            const assetKey: AssetKey = 'scene_start_frame';

            // Set initial state
            act(() => {
                result.current.setAssets(entityId, {
                    [ assetKey ]: {
                        head: 1,
                        best: 1,
                        versions: [ {
                            version: 1,
                            data: 'old-url',
                            type: 'image' as const,
                            metadata: { model: 'old-model', jobId: '' },
                            createdAt: new Date('2024-01-01')
                        } ]
                    }
                });
            });

            // Merge new history (should replace, not merge)
            const newHistory: AssetHistory = {
                head: 2,
                best: 2,
                versions: [
                    {
                        version: 2,
                        data: 'new-url',
                        type: 'image' as const,
                        metadata: { model: 'new-model', jobId: '' },
                        createdAt: new Date('2024-01-02')
                    }
                ]
            };

            act(() => {
                result.current.mergeAssetHistories([ {
                    entityId,
                    assetKey,
                    history: newHistory
                } ]);
            });

            const assets = result.current.assets.get(entityId);
            expect(assets?.[ assetKey ]).toEqual(newHistory);
        });

        it('should preserve other asset keys when merging', () => {
            const { result } = renderHook(() => useAssetStore());

            const entityId = 'scene-1';
            const assetKey1: AssetKey = 'scene_start_frame';
            const assetKey2: AssetKey = 'scene_end_frame';

            // Set initial state with multiple asset keys
            act(() => {
                result.current.setAssets(entityId, {
                    [ assetKey1 ]: {
                        head: 1,
                        best: 1,
                        versions: [ { version: 1, data: 'url1', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() } ]
                    },
                    [ assetKey2 ]: {
                        head: 1,
                        best: 1,
                        versions: [ { version: 1, data: 'url2', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() } ]
                    }
                });
            });

            // Update only one asset key
            const newHistory: AssetHistory = {
                head: 2,
                best: 2,
                versions: [ { version: 2, data: 'new-url1', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() } ]
            };

            act(() => {
                result.current.mergeAssetHistories([ {
                    entityId,
                    assetKey: assetKey1,
                    history: newHistory
                } ]);
            });

            const assets = result.current.assets.get(entityId);
            expect(assets?.[ assetKey1 ]).toEqual(newHistory);
            expect(assets?.[ assetKey2 ]).toEqual({
                head: 1,
                best: 1,
                versions: [ { version: 1, data: 'url2', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: expect.any(Date) } ]
            });
        });
    });

    describe('mergeAssets', () => {
        it('should merge registries preserving existing keys', () => {
            const { result } = renderHook(() => useAssetStore());

            const entityId = 'scene-1';

            // Set initial state
            act(() => {
                result.current.setAssets(entityId, {
                    scene_start_frame: {
                        head: 1,
                        best: 1,
                        versions: [ { version: 1, data: 'url1', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() } ]
                    }
                });
            });

            // Merge new registry with additional key
            const newRegistry = {
                scene_end_frame: {
                    head: 1,
                    best: 1,
                    versions: [ { version: 1, data: 'url2', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() } ]
                }
            };

            act(() => {
                result.current.mergeAssets(entityId, newRegistry);
            });

            const assets = result.current.assets.get(entityId);
            expect(assets).toEqual(expect.objectContaining({
                scene_start_frame: expect.objectContaining({
                    head: 1,
                    best: 1,
                    versions: [ expect.objectContaining({ version: 1, data: 'url1', type: 'image' }) ]
                }),
                scene_end_frame: expect.objectContaining({
                    head: 1,
                    best: 1,
                    versions: [ expect.objectContaining({ version: 1, data: 'url2', type: 'image' }) ]
                })
            }));
        });

        it('should handle conflicting keys by merging histories', () => {
            const { result } = renderHook(() => useAssetStore());

            const entityId = 'scene-1';
            const assetKey: AssetKey = 'scene_start_frame';

            // Set initial state
            act(() => {
                result.current.setAssets(entityId, {
                    [ assetKey ]: {
                        head: 1,
                        best: 1,
                        versions: [ { version: 1, data: 'url1', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() } ]
                    }
                });
            });

            // Merge registry with conflicting key
            const newRegistry = {
                [ assetKey ]: {
                    head: 2,
                    best: 2,
                    versions: [
                        { version: 1, data: 'url1', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() },
                        { version: 2, data: 'url2', type: 'image' as const, metadata: { model: '', jobId: '' }, createdAt: new Date() }
                    ]
                }
            };

            act(() => {
                result.current.mergeAssets(entityId, newRegistry);
            });

            const assets = result.current.assets.get(entityId);
            expect(assets?.[ assetKey ]).toEqual(expect.objectContaining({
                head: 2,
                best: 2,
                versions: expect.arrayContaining([
                    expect.objectContaining({ version: 1, data: 'url1' }),
                    expect.objectContaining({ version: 2, data: 'url2' })
                ])
            }));
        });
    });

    describe('optimistic updates', () => {
        it('should track optimistic updates correctly', () => {
            const { result } = renderHook(() => useAssetStore());

            const updateId = 'update-1';
            const entityId = 'scene-1';
            const assetKey: AssetKey = 'scene_start_frame';

            act(() => {
                result.current.addOptimisticUpdate({
                    id: updateId,
                    entityId,
                    assetKey,
                    version: 2,
                });
            });

            expect(result.current.optimisticUpdates.has(updateId)).toBe(true);
            const update = result.current.optimisticUpdates.get(updateId);
            expect(update).toMatchObject({
                id: updateId,
                entityId,
                assetKey,
                version: 2,
            });
            expect(update?.timestamp).toBeTypeOf('number');
        });

        it('should confirm optimistic updates', () => {
            const { result } = renderHook(() => useAssetStore());

            const updateId = 'update-1';

            // Add update
            act(() => {
                result.current.addOptimisticUpdate({
                    id: updateId,
                    entityId: 'scene-1',
                    assetKey: 'scene_start_frame',
                    version: 2,
                });
            });

            expect(result.current.optimisticUpdates.has(updateId)).toBe(true);

            // Confirm update
            act(() => {
                result.current.confirmOptimisticUpdate(updateId);
            });

            expect(result.current.optimisticUpdates.has(updateId)).toBe(false);
        });

        it('should revert optimistic updates', () => {
            const { result } = renderHook(() => useAssetStore());

            const updateId = 'update-1';

            // Add update
            act(() => {
                result.current.addOptimisticUpdate({
                    id: updateId,
                    entityId: 'scene-1',
                    assetKey: 'scene_start_frame',
                    version: 2,
                });
            });

            expect(result.current.optimisticUpdates.has(updateId)).toBe(true);

            // Revert update
            act(() => {
                result.current.revertOptimisticUpdate(updateId);
            });

            expect(result.current.optimisticUpdates.has(updateId)).toBe(false);
        });
    });
});
