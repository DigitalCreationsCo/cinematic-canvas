import { PipelineCommand } from "../../shared/types/pubsub.types";
import { WorkflowOperator } from "../services/workflow-service";

export async function handleUpdateSceneAssetCommand(
    command: Extract<PipelineCommand, { type: "UPDATE_SCENE_ASSET"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId, payload } = command;
    try {
        await workflowOperator.updateSceneAsset(projectId, payload);
    } catch (error) {
        console.error("Error handling UPDATE_SCENE_ASSET:", error);
    }
}
