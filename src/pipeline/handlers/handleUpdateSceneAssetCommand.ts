import { PipelineCommand } from "../../shared/types/pipeline.types.js";
import { WorkflowOperator } from "../workflow-service.js";
import { PipelineCommandHandler } from "../command-handler.js";

export async function handleUpdateSceneAssetCommand(
    command: Extract<PipelineCommand, { type: "UPDATE_SCENE_ASSET"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId } = command;
    try {
        // Atomic DB Update
        await PipelineCommandHandler.handleUpdateAsset(command);
        
        // Broadcast new state to client
        await workflowOperator.getProjectState(projectId);
        
    } catch (error) {
        console.error("Error handling UPDATE_SCENE_ASSET:", error);
    }
}
