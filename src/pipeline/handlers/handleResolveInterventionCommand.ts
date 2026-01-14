import { PipelineCommand } from "../../shared/types/pipeline.types";
import { WorkflowOperator } from "../services/workflow-service";

export async function handleResolveInterventionCommand(
    command: Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>,
    workflowOperator: WorkflowOperator,
) {
    const { projectId, payload } = command;
    try {
        await workflowOperator.resolveIntervention(projectId, payload);
    } catch (error) {
        console.error("Error resolving intervention:", error);
    }
}
