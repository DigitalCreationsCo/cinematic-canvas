import { TextModelController } from "../lm/text-model-controller.js";
import { VideoModelController } from "../lm/video-model-controller.js";
import { BatchJob } from "../lm/provider.js";

export async function pollForBatchJob(
    lm: TextModelController,
    batchJob: BatchJob,
    description: string
): Promise<BatchJob> {
    console.log(`[Batch] Submitted ${description}. Job ID: ${batchJob.name}`);

    let currentJob = batchJob;
    const POLLING_INTERVAL = 8000;

    while (currentJob.state === "JOB_STATE_UNSPECIFIED" || currentJob.state === "JOB_STATE_PENDING" || currentJob.state === "JOB_STATE_RUNNING") {
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));

        currentJob = await lm.getBatchJob({ name: currentJob.name || "" });
        console.log(`[Batch] ${description} status: ${currentJob.state}`);
    }

    if (currentJob.state === "JOB_STATE_FAILED" || currentJob.state === "JOB_STATE_CANCELLED") {
        throw new Error(`Batch job ${description} failed with state ${currentJob.state}: ${currentJob.error?.message}`);
    }

    return currentJob;
}