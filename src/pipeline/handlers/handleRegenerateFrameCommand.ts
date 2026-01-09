import { PipelineCommand } from "../../shared/types/pubsub.types";
import { WorkflowOperator } from "../services/workflow-service";

export async function handleRegenerateFrameCommand(
    command: Extract<PipelineCommand, { type: "REGENERATE_FRAME"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId, payload } = command;
    console.log(`Regenerating ${payload.frameType} frame for scene ${payload.sceneId} for projectId: ${projectId}`);

    try {
        await workflowOperator.regenerateFrame(
            projectId,
            payload
        );
    } catch (error) {
        console.error(`Error regenerating frame for ${projectId}:`, error);
    }
}
