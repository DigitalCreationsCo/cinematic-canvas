
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProjectRepository } from "../project-repository.js";
import { AssetVersionManager } from "../asset-version-manager.js";
import { db } from "../../db/index.js";
import { projects, scenes } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { generateId } from "#shared/utils/id.js";
import { Project, Scene } from "../../types/index.js";

describe("ProjectRepository Asset Persistence", () => {
    let repo: ProjectRepository;
    let assetManager: AssetVersionManager;
    let projectId: string;

    beforeAll(async () => {
        repo = new ProjectRepository();
        assetManager = new AssetVersionManager(repo);
        projectId = generateId();

        const insertProject = {
            id: projectId,
            metadata: {
                title: "Asset Persistence Test",
                projectId: projectId,
                initialPrompt: "Test prompt"
            },
            storyboard: {
                scenes: [],
                characters: [],
                locations: [],
                metadata: {
                    title: "Asset Persistence Test",
                    projectId: projectId,
                    initialPrompt: "Test prompt"
                }
            },
            forceRegenerateSceneIds: [],
            generationRules: [],
            generationRulesHistory: [],
            status: "pending" as const, // Changed from ready
            currentSceneIndex: 0
        };
        await repo.createProject(insertProject);
    });

    afterAll(async () => {
        await db.delete(projects).where(eq(projects.id, projectId));
    });

    it("should NOT overwrite existing assets when upserting a scene", async () => {
        // 1. Create a scene
        // 1. Create a location (required for scene)
        const locationId = generateId();
        await repo.createLocations(projectId, [{
            id: locationId,
            projectId,
            referenceId: "loc_test",
            name: "Test Location",
            type: "Indoor",
            mood: "Neutral",
            lightingConditions: {
                quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" },
                motivatedSources: { primaryLight: "", fillLight: "", practicalLights: "", accentLight: "", lightBeams: "" },
                direction: { keyLightPosition: "", shadowDirection: "", contrastRatio: "" },
                atmosphere: { haze: "None" }
            },
            timeOfDay: "Day",
            weather: "Clear",
            colorPalette: [],
            architecture: [],
            naturalElements: [],
            manMadeObjects: [],
            groundSurface: "Floor",
            skyOrCeiling: "Ceiling",
            state: {},
            assets: {},
        }]);

        // 2. Create a scene
        const sceneId = generateId();
        const initialScene = {
            id: sceneId,
            projectId,
            sceneIndex: 0,

            // Director
            name: "Test Scene",
            description: "Test description",
            mood: "Neutral",
            audioSync: "Mood Sync",

            // Script Supervisor
            locationId,
            locationReferenceId: "loc_test",
            characterIds: [],
            characterReferenceIds: [],
            continuityNotes: [],

            // Cinematography
            transitionType: "Cut" as const,
            shotType: "Medium Shot" as const,
            cameraAngle: "Eye Level" as const,
            cameraMovement: "Static" as const,
            composition: {
                "Subject Placement": "Center",
                "Focal Point": "Center",
                "Depth Layers": "Foreground",
                "Leading Lines": "None",
                "Headroom": "Standard",
                "Look Room": "None"
            },
            lighting: {
                quality: { hardness: "Soft", colorTemperature: "Neutral", intensity: "Medium" },
                motivatedSources: { primaryLight: "", fillLight: "", practicalLights: "", accentLight: "", lightBeams: "" },
                direction: { keyLightPosition: "", shadowDirection: "", contrastRatio: "" },
                atmosphere: { haze: "None" }
            },

            // Audio
            startTime: 0,
            endTime: 10,
            duration: 10,
            type: "lyrical" as const,
            audioEvidence: "Dialog",
            transientImpact: "none" as const,
            tempo: "moderate" as const,
            lyrics: "",
            musicalDescription: "",
            musicChange: "",
            intensity: "medium" as const,

            status: "pending" as const,
            assets: {},
            progressMessage: ""
        };

        await repo.createScenes(projectId, [initialScene]);

        // 2. Add an asset using AssetVersionManager
        const assetScope = { projectId, sceneIds: [sceneId] };
        await assetManager.createVersionedAssets(
            assetScope,
            ["scene_start_frame"],
            "image",
            ["http://example.com/image.png"],
            [{ model: "dall-e", jobId: "test-job" }],
            true // setBest
        );

        // Verify asset exists
        let sceneWithAsset = await repo.getScene(sceneId);
        expect(sceneWithAsset.assets).toBeDefined();
        expect(sceneWithAsset.assets!["scene_start_frame"]).toBeDefined();

        // 3. Upsert the scene (simulating a status update from worker)
        // CRITICAL: We pass the scene WITHOUT the assets property, or with empty assets
        // equivalent to what happens when we map from domain back to DB insert
        const updatePayload = {
            ...initialScene,
            status: "generating" as const,
        };

        await repo.upsertScenes(projectId, [updatePayload]);

        // 4. Verify asset STILL exists
        const sceneAfterUpsert = await repo.getScene(sceneId);

        // This expectation fails if upsert overwrites assets with null/empty
        expect(sceneAfterUpsert.assets).toBeDefined();
        expect(sceneAfterUpsert.assets!["scene_start_frame"]).toBeDefined();
        expect(sceneAfterUpsert.status).toBe("generating");
    });
});
