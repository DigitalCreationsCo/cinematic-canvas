import { PipelineCommand } from "../../shared/pubsub-types";
import { WorkflowService } from "../services/workflow-service";

export async function handleResolveInterventionCommand(
    command: Extract<PipelineCommand, { type: "RESOLVE_INTERVENTION"; }>,
    workflowService: WorkflowService,
) {
    const { projectId, payload } = command;
    try {
        await workflowService.resolveIntervention(projectId, payload);
    } catch (error) {
        console.error("Error resolving intervention:", error);
    }
}
