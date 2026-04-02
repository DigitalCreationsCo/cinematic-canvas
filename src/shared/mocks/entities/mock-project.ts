// @ts-nocheck
import { generateId } from "#shared/utils/id.js";
import type { AssetKey, Project } from "../../types/index.js";
import { createMockScene } from "./mock-scene.js";
import { createMockCharacter } from "./mock-character.js";
import { createMockLocation } from "./mock-location.js";
import { createMockProjectMetadata } from "../mock-metadata.js";
import { AssetRegistry } from "../../types/index.js";

type ProjectKV = Omit<Project, 'assets'> & {
    assets?: Partial<Record<AssetKey, string>>;
};

export const createMockProject = (overrides?: Partial<ProjectKV>): Project => {
    const projectId = overrides?.id ?? generateId();
    const timestamp = new Date();
    const scenes = overrides?.scenes ?? [
        createMockScene({ projectId, sceneIndex: 0, name: "Opening Scene" }),
        createMockScene({ projectId, sceneIndex: 1, name: "Middle Scene" }),
    ];
    const characters = overrides?.characters ?? [createMockCharacter({ projectId, name: "Protagonist" })];
    const locations = overrides?.locations ?? [createMockLocation({ projectId, name: "Main Location" })];

    return {
        // IdentityBase
        id: projectId,
        createdAt: overrides?.createdAt ?? timestamp,
        updatedAt: overrides?.updatedAt ?? timestamp,
        // ProjectBase
        storyboard: overrides?.storyboard ?? {
            metadata: createMockProjectMetadata(),
            scenes,
            characters,
            locations,
        },
        metadata: overrides?.metadata ?? createMockProjectMetadata(),
        audioAnalysis: overrides?.audioAnalysis ?? null,
        generationRules: overrides?.generationRules ?? [],
        generationRulesHistory: overrides?.generationRulesHistory ?? [],
        currentSceneIndex: overrides?.currentSceneIndex ?? 0,
        status: overrides?.status ?? "pending",
        forceRegenerateSceneIds: overrides?.forceRegenerateSceneIds ?? [],
        assets: overrides?.assets ?? AssetRegistry.parse({}),
        // Extended arrays
        scenes,
        characters,
        locations,
    };
};