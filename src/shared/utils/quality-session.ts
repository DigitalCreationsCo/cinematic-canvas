// src/pipeline/utils/quality-session.ts
import { Scene, QualityEvaluationResult, IncrementAttemptHook, SaveAssetsCallback } from "../types/index.js";
import { AssetVersionManager } from "../services/asset-version-manager.js";
import { GCPStorageManager } from "../services/storage-manager.js";
import { WorkflowFatalError } from "./errors.js";

export class QualityGenerationSession {
    private currentAttemptNumber: number = 1;
    private currentVersion: number = 1;

    constructor(
        private readonly scene: Scene,
        private readonly framePosition: "start" | "end",
        private readonly assetManager: AssetVersionManager,
        private readonly storageManager: GCPStorageManager,
        private readonly saveAssets: SaveAssetsCallback,
        private readonly incrementAttempt: IncrementAttemptHook,
    ) { }

    /**
     * Prepares the state for the NEXT generation attempt.
     * Syncs with AssetManager to get the correct file version.
     */
    async prepareNextAttempt(): Promise<{ version: number; attempt: number; }> {
        // Always fetch the next available version number for storage
        const assetKey = this.framePosition === "start" ? "scene_start_frame" : "scene_end_frame";
        const [ version ] = await this.assetManager.getNextVersionNumber(
            { projectId: this.scene.projectId, sceneIds: [ this.scene.id ] },
            [assetKey]
        );
        this.currentVersion = version;

        // Return the state needed for the generation params
        return { version: this.currentVersion, attempt: this.currentAttemptNumber };
    }

    /**
     * Handles the DB synchronization when a failure occurs.
     * Updates the internal attempt counter based on the DB response.
     */
    async recordFailure(error: any): Promise<void> {
        const reason = error instanceof Error ? error.message : String(error);

        try {
            const updatedJob = await this.incrementAttempt(reason, "BACKOFF_RETRY");
            this.currentAttemptNumber = updatedJob.attempts.currentAttempt;
        } catch (err) {
            // If this is an optimistic locking failure, we are in a split-brain scenario.
            // Throw a specific error that the Handler knows should NOT be retried.
            if (err.code === 'OPTIMISTIC_LOCK_FAILURE') {
                throw new WorkflowFatalError("Job state out of sync. Terminating local execution.", { error: err });
            }
            throw err;
        }
    }

    /**
     * Encapsulates the complex 3-way asset saving logic.
     */
    async saveArtifacts({
        image,
        prompt,
        video,
        evaluation,
        models
    }: {
        image?: string;
        prompt?: string;
        video?: string;
        evaluation: QualityEvaluationResult;
        models: {
            imageModelName?: string;
            textModelName?: string;
            videoModelName?: string;
        };
    }): Promise<void> {

        const frameKey = this.framePosition === "start" ? "scene_start_frame" : "scene_end_frame";
        const promptKey = this.framePosition === "start" ? "start_frame_prompt" : "end_frame_prompt";

        // 1. Save Image
        if (image)
            this.saveAssets(
                { projectId: this.scene.projectId, sceneIds: [ this.scene.id ] },
                [ frameKey ], 'image', [ image ],
                [ { model: models.imageModelName, evaluation } ],
                true
            );

        // 2. Save Prompt
        if (prompt)
            this.saveAssets(
                { projectId: this.scene.projectId, sceneIds: [ this.scene.id ] },
                [ promptKey ], 'text', [ prompt ],
                [ { model: models.textModelName } ],
                true
            );

        // 3. Save Video
        if (video)
            this.saveAssets(
                { projectId: this.scene.projectId, sceneIds: [ this.scene.id ] },
                [ frameKey ], 'video', [ video ],
                [ { model: models.videoModelName, evaluation } ],
                true
            );
    }
}