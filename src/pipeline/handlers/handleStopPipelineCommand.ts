import { PipelineCommand } from "../../shared/types/pipeline.types.js";

export async function handleStopPipelineCommand(
    command: Extract<PipelineCommand, { type: "STOP_PIPELINE"; }>,
    publishCancellation: (projectId: string) => Promise<void>
) {
    const { projectId } = command;

    try {
        console.log(`[handleStopPipelineCommand] Broadcasting stop for projectId: ${projectId}`);
        await publishCancellation(projectId);
    } catch (error) {
        console.error("[handleStopPipelineCommand] Error broadcasting stop pipeline:", error);
    }
}
