export const TOPIC_NAMES = {
  JOB_EVENTS_TOPIC_NAME: "job-events",
  PIPELINE_EVENTS_TOPIC_NAME: "pipeline-events",
  PIPELINE_COMMANDS_TOPIC_NAME: "pipeline-commands",
  PIPELINE_CANCELLATIONS_TOPIC_NAME: "pipeline-cancellations",
};

export const SUBSCRIPTION_NAMES = {
  WORKER_JOB_EVENTS_SUBSCRIPTION: "worker-job-events-subscription",
  PIPELINE_JOB_EVENTS_SUBSCRIPTION: "pipeline-job-events-subscription",
  PIPELINE_COMMANDS_SUBSCRIPTION: "pipeline-commands-subscription",
  SERVER_PIPELINE_EVENTS_SUBSCRIPTION: "server-pipeline-events-subscription",
};

export const imageMimeType = "image/png";

export const aspectRatios = {
  square: {
    aspectRatio: "1:1",
    width: 1024,
    height: 1024,
  },
  portrait: {
    aspectRatio: "4:5",
    width: 832,
    height: 1024,
  },
  tv: {
    aspectRatio: "4:3",
    width: 1360,
    height: 1024,
  },
  vertical: {
    aspectRatio: "9:16",
    width: 576,
    height: 1024,
  },
  widescreen: {
    aspectRatio: "16:9",
    width: 1024,
    height: 576,
  },
  ultrawide: {
    aspectRatio: "21:9",
    width: 1344,
    height: 576,
  },
};

/**
 * Three-way execution mode (set via EXECUTION_MODE env var):
 *
 *  BATCH      — provider async batch job API; requests are submitted as a single
 *               batch job to GCS and resolved asynchronously. Highest throughput,
 *               best for large volumes.
 *
 *  PARALLEL   — concurrent individual provider calls via Promise.all. Lower latency
 *               than BATCH for small volumes, subject to rate limits.
 *
 *  SEQUENTIAL — serial individual provider calls. Lowest resource usage, safest
 *               against rate limits.
 */

export type ExecutionMode = "BATCH" | "PARALLEL" | "SEQUENTIAL";

const readPositiveIntegerEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const getExecutionMode = (): ExecutionMode => {
  const envValue = process.env.EXECUTION_MODE as ExecutionMode | undefined;

  if (envValue === "BATCH" || envValue === "PARALLEL" || envValue === "SEQUENTIAL") {
    return envValue;
  }

  console.warn(" ! EXECUTION_MODE is not defined or invalid. Defaulting to 'SEQUENTIAL'.");
  return "SEQUENTIAL";
};

export const getTestMode = (): boolean => {
  return process.env.TEST_MODE === "true";
};

export const getMaxParallelJobs = (): number => {
  return parseInt(process.env.MAX_PARALLEL_JOBS || "10");
};

export const getMaxRetries = (): number => {
  return parseInt(process.env.MAX_RETRIES || "2");
};

export const getGlobalModelCooldownMs = (): number => {
  return readPositiveIntegerEnv("GLOBAL_MODEL_COOLDOWN_MS", 5000);
};

export const getParallelImageStaggerMs = (): number => {
  return readPositiveIntegerEnv("PARALLEL_IMAGE_STAGGER_MS", 15000);
};

export const getImageRateLimitRetryDelayMs = (): number => {
  return readPositiveIntegerEnv("IMAGE_RATE_LIMIT_RETRY_DELAY_MS", 60000);
};
