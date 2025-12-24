import { PipelineCommand, PipelineEvent } from "../../shared/pubsub-types";
import { GraphState } from "../../shared/pipeline-types";
import { CheckpointerManager } from "../../pipeline/checkpointer-manager";
import { RunnableConfig } from "@langchain/core/runnables";
import { GCPStorageManager } from "../../pipeline/storage-manager";
import { LlmController } from "../../pipeline/llm/controller";
import { QualityCheckAgent } from "../../pipeline/agents/quality-check-agent";
import { FrameCompositionAgent } from "../../pipeline/agents/frame-composition-agent";
import { ContinuityManagerAgent } from "../../pipeline/agents/continuity-manager";

export async function handleRegenerateFrameCommand(
    command: Extract<PipelineCommand, { type: "REGENERATE_FRAME"; }>,
    publishPipelineEvent: (event: PipelineEvent) => Promise<void>,
    checkpointerManager: CheckpointerManager,
) {
    const gcpProjectId = process.env.GCP_PROJECT_ID;
    if (!gcpProjectId) throw new Error("GCP_PROJECT_ID environment variable not set.");

    const { projectId, payload } = command;
    if (!projectId) throw Error("A projectId was not provided");

    const bucketName = process.env.GCP_BUCKET_NAME;
    if (!bucketName) {
        throw new Error("GCP_BUCKET_NAME environment variable not set.");
    }

    const { sceneId, frameType, promptModification } = payload;
    console.log(`Regenerating ${frameType} frame for scene ${sceneId} for projectId: ${projectId}`);

    const runnableConfig: RunnableConfig = {
        configurable: { thread_id: projectId },
    };

    const existingCheckpoint = await checkpointerManager.loadCheckpoint(runnableConfig);
    if (!existingCheckpoint) {
        console.warn(`No checkpoint found to regenerate frame for projectId: ${projectId}`);
        return;
    }

    const currentState = existingCheckpoint.channel_values as GraphState;
    const scene = currentState.storyboardState?.scenes.find(s => s.id === sceneId);
    if (!scene) {
        console.error(`Scene ${sceneId} not found in state.`);
        return;
    }

    // --- State and Agent Initialization ---
    const storageManager = new GCPStorageManager(gcpProjectId, projectId, bucketName);
    const textLlm = new LlmController();
    const imageLlm = new LlmController();
    const qualityAgent = new QualityCheckAgent(textLlm, storageManager);
    const frameComposer = new FrameCompositionAgent(imageLlm, qualityAgent, storageManager);
    const continuityManager = new ContinuityManagerAgent(textLlm, imageLlm, frameComposer, qualityAgent, storageManager);


    const sceneCharacters = currentState.storyboardState!.characters.filter(char => scene.characters.includes(char.id));
    const sceneLocation = currentState.storyboardState!.locations.find(loc => scene.locationId.includes(loc.id));

    if (!sceneLocation) {
        console.error(`Location ${scene.locationId} not found in state.`);
        return;
    }

    const previousSceneIndex = currentState.storyboardState!.scenes.findIndex(s => s.id === scene.id) - 1;
    const previousScene = previousSceneIndex >= 0 ? currentState.storyboardState!.scenes[ previousSceneIndex ] : undefined;


    console.log(`  → Regenerating ${frameType} frame for Scene ${scene.id}...`);

    const newFrame = await frameComposer.generateImage(
        scene,
        promptModification,
        frameType,
        sceneCharacters,
        [ sceneLocation ],
        frameType === 'start' ? previousScene?.endFrame : scene.startFrame,
        [
            ...sceneCharacters.flatMap(c => c.referenceImages || []),
            ...(sceneLocation.referenceImages || []),
        ]
    );

    // --- Update State ---
    const updatedScenes = currentState.storyboardState!.scenes.map(s => {
        if (s.id === sceneId) {
            return {
                ...s,
                [ frameType === 'start' ? 'startFrame' : 'endFrame' ]: newFrame,
                [ frameType === 'start' ? 'startFramePrompt' : 'endFramePrompt' ]: promptModification,
            };
        }
        return s;
    });

    const newState: GraphState = {
        ...currentState,
        storyboardState: {
            ...currentState.storyboardState!,
            scenes: updatedScenes,
        },
    };

    // --- Save Checkpoint and Publish ---
    const checkpointer = await checkpointerManager.getCheckpointer();
    if (!checkpointer) {
        throw new Error("Checkpointer not initialized");
    }
    await checkpointer.put(runnableConfig, {
        ...existingCheckpoint,
        channel_values: newState
    }, {} as any, {});


    await publishPipelineEvent({
        type: "FULL_STATE",
        projectId,
        payload: { state: newState },
        timestamp: new Date().toISOString(),
    });

    console.log(`✓ Successfully regenerated and updated ${frameType} frame for scene ${sceneId}.`);
}