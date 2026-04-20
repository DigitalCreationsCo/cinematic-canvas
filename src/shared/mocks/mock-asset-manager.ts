import { vi, type Mock } from 'vitest';
import type { AssetVersionManager } from '../services/asset-version-manager.js';

export interface MockAssetManager extends Partial<AssetVersionManager> {
    getNextVersionNumber: Mock;
    getBestVersion: Mock;
    createVersionedAssets: Mock;
    batchCreateVersionedAssets: Mock;
    setBestVersion: Mock;
    deleteVersions: Mock;
    getAllSceneAssets: Mock;
    getAllProjectAssets: Mock;
    getAllCharacterAssets: Mock;
    getAllLocationAssets: Mock;
    getAllFileAssets: Mock;
    getAssetRegistryForEntity: Mock;
    getCompletedProjectVideos: Mock;
    recordUserFeedback: Mock;
}

export const createMockAssetManager = (overrides?: Partial<MockAssetManager>): MockAssetManager => ({
    getNextVersionNumber: vi.fn().mockResolvedValue([1]),
    getBestVersion: vi.fn().mockResolvedValue([]),
    createVersionedAssets: vi.fn().mockResolvedValue({}),
    batchCreateVersionedAssets: vi.fn().mockResolvedValue({}),
    setBestVersion: vi.fn().mockResolvedValue([{ best: 1 }]),
    deleteVersions: vi.fn().mockResolvedValue(undefined),
    getAllSceneAssets: vi.fn().mockResolvedValue({}),
    getAllProjectAssets: vi.fn().mockResolvedValue({}),
    getAllCharacterAssets: vi.fn().mockResolvedValue({}),
    getAllLocationAssets: vi.fn().mockResolvedValue({}),
    getAllFileAssets: vi.fn().mockResolvedValue({}),
    getAssetRegistryForEntity: vi.fn().mockResolvedValue({}),
    getCompletedProjectVideos: vi.fn().mockResolvedValue([]),
    recordUserFeedback: vi.fn().mockResolvedValue(undefined),
    ...overrides,
});