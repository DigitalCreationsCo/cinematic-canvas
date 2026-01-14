import { PipelineCommand } from "../../shared/types/pipeline.types";
import { WorkflowOperator } from "../services/workflow-service";

export async function handleResumePipelineCommand(
    command: Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId } = command;
    console.log(`[handleResumePipelineCommand] Resuming pipeline for projectId: ${projectId}`);

    try {
        await workflowOperator.resumePipeline(projectId);
    } catch (error) {
        console.error(`[handleResumePipelineCommand] Error resuming pipeline for ${projectId}:`, error);
    }
}
