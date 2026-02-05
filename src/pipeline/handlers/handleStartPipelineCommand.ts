import { PipelineCommand } from "../../shared/types/pipeline.types.js";
import { WorkflowOperator } from "../workflow-service.js";


export async function handleStartPipelineCommand(
    command: Extract<PipelineCommand, { type: "START_PIPELINE"; }>,
    workflowOperator: WorkflowOperator,
) {
    console.log({ command, functionName: "handleStartPipelineCommand"}, `Starting pipeline`);
    const { projectId, payload } = command;
    try {

        await workflowOperator.startPipeline(projectId!, payload);
    } catch (error) {
        console.error({ command, functionName: "handleStartPipelineCommand", error }, `Error starting pipeline`);
        // Error handling is mostly done inside WorkflowOperator/stream-helper, but we catch top-level failures here
    }
}
