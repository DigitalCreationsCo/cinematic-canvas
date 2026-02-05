import { TextModelController } from "../llm/text-model-controller.js";
import { VideoModelController } from "../llm/video-model-controller.js";
import { BatchJob } from "../llm/provider-types.js";

export async function pollForBatchJob(
    llm: TextModelController,
    batchJob: BatchJob,
    description: string
): Promise<BatchJob> {
    console.log(`[Batch] Submitted ${description}. Job ID: ${batchJob.name}`);

    let currentJob = batchJob;
    const POLLING_INTERVAL = 8000;

    while (currentJob.state === "JOB_STATE_UNSPECIFIED" || currentJob.state === "JOB_STATE_PENDING" || currentJob.state === "JOB_STATE_RUNNING") {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));

        currentJob = await llm.getBatchJob({ name: currentJob.name || "" });
        console.log(`[Batch] ${description} status: ${currentJob.state}`);
    }

    if (currentJob.state === "JOB_STATE_FAILED" || currentJob.state === "JOB_STATE_CANCELLED") {
        throw new Error(`Batch job ${description} failed with state ${currentJob.state}: ${currentJob.error?.message}`);
    }

    return currentJob;
}