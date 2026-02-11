import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AttemptMetadata, Job, JobState, JobType } from "../types/job.types.js";
import { AssetHistory, AssetKey, AssetVersion, Scope } from "../types/assets.types.js";
import { JobControlPlane } from "../services/job-control-plane.js";

export const createEmptyHistory = (): AssetHistory => ({
    head: 0,
    best: 0,
    versions: [],
});

export const createHistoryWithVersions = (count: number): AssetHistory => {
    const versions: AssetVersion[] = [];
    for (let i = 1; i <= count; i++) {
        versions.push({
            version: i,
            type: 'image',
            data: `data:image/png;base64,test${i}`,
            metadata: { jobId: `job-${i}`, model: 'test-model' },
            createdAt: new Date(`2024-01-${i.toString().padStart(2, '0')}`),
        });
    }
    return {
        head: count,
        best: count,
        versions,
    };
};

export const createProjectScope = (projectId: string): Scope => ({
    projectId,
});

export const createSceneScope = (projectId: string, sceneIds: string[]): Scope => ({
    projectId,
    sceneIds,
});

export const createCharacterScope = (projectId: string, characterIds: string[]): Scope => ({
    projectId,
    characterIds,
});

export const createLocationScope = (projectId: string, locationIds: string[]): Scope => ({
    projectId,
    locationIds,
});