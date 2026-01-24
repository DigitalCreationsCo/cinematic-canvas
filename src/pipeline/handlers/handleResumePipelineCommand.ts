import { PipelineCommand } from "../../shared/types/pipeline.types.js";
import { WorkflowOperator } from "../workflow-service.js";
import { v7 as uuidv7 } from 'uuid';

export async function handleResumePipelineCommand(
    command: Extract<PipelineCommand, { type: "RESUME_PIPELINE"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId } = command;
    console.log({ command }, `handleResumePipelineCommand`);

    try {
        await workflowOperator.resumePipeline(projectId);
    } catch (error) {
        console.error({ command, error }, 'handleResumePipelineCommand failed');
        await workflowOperator.publishEvent({
            commandId: uuidv7(),
            type: "WORKFLOW_FAILED",
            projectId: projectId,
            payload: { error: error as string },
            timestamp: new Date().toISOString()
        });
    }
}
