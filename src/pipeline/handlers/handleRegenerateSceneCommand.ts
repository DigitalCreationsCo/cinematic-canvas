import { PipelineCommand } from "../../shared/types/pubsub.types";
import { WorkflowOperator } from "../services/workflow-service";

export async function handleRegenerateSceneCommand(
    command: Extract<PipelineCommand, { type: "REGENERATE_SCENE"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId, payload } = command;
    console.log(`[handleRegenerateSceneCommand] Regenerating scene ${payload.sceneId} for projectId: ${projectId}`);

    try {
        await workflowOperator.regenerateScene(projectId, payload);
    } catch (error) {
        console.error(`[handleRegenerateSceneCommand] Error regenerating scene for ${projectId}:`, error);
    }
}
