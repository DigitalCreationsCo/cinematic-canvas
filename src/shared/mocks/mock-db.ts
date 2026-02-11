
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AssetVersionManager } from '../services/asset-version-manager.js';
import { ProjectRepository } from '../services/project-repository.js';
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
} from '../types/index.js';

export const createMockDb = () => {
    const mockData = {
        projects: new Map<string, any>(),
        scenes: new Map<string, any>(),
        characters: new Map<string, any>(),
        locations: new Map<string, any>(),
    };

    const mockTx = {
        select: vi.fn(() => mockTx),
        from: vi.fn(() => mockTx),
        where: vi.fn(() => mockTx),
        for: vi.fn(() => Promise.resolve([])),
        update: vi.fn(() => mockTx),
        set: vi.fn(() => mockTx),
        returning: vi.fn(() => Promise.resolve([])),
    };

    return {
        transaction: vi.fn(async (callback) => callback(mockTx)),
        ...mockTx,
        mockData,
    };
};

export const createMockRepository = () => {
    const repo = {
        getProject: vi.fn(),
        getProjectWithLock: vi.fn(),
        getProjectScenes: vi.fn(),
        getProjectCharacters: vi.fn(),
        getProjectLocations: vi.fn(),
        getScene: vi.fn(),
        getScenesWithLock: vi.fn(),
        getCharactersByIds: vi.fn(),
        getCharactersWithLock: vi.fn(),
        getLocationsByIds: vi.fn(),
        getLocationsWithLock: vi.fn(),
        updateAssetsForTable: vi.fn(),
    } as unknown as ProjectRepository;

    return repo;
};