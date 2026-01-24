import { PipelineCommand } from "../../shared/types/pipeline.types.js";
import { WorkflowOperator } from "../workflow-service.js";

export async function handleRequestFullStateCommand(
    command: Extract<PipelineCommand, { type: "REQUEST_FULL_STATE"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId } = command;
    try {
        workflowOperator.getProjectState(projectId);
    } catch (error) {
        console.error("Error handling REQUEST_FULL_STATE:", error);
    }
}
