
export const JOB_EVENTS_TOPIC_NAME = "job-events";
export const PIPELINE_EVENTS_TOPIC_NAME = "pipeline-events";
export const PIPELINE_COMMANDS_TOPIC_NAME = "pipeline-commands";
export const PIPELINE_CANCELLATIONS_TOPIC_NAME = "pipeline-cancellations";

export const WORKER_JOB_EVENTS_SUBSCRIPTION = "worker-job-events-subscription";
export const PIPELINE_JOB_EVENTS_SUBSCRIPTION = "pipeline-job-events-subscription";
export const PIPELINE_COMMANDS_SUBSCRIPTION = "pipeline-commands-subscription";
export const SERVER_PIPELINE_EVENTS_SUBSCRIPTION = "server-pipeline-events-subscription";

export const imageMimeType = "image/png";
export const aspectRatios = {
    "square": {
        "aspectRatio": "1:1",
        "width": 1024,
        "height": 1024
    },
    "portrait": {
        "aspectRatio": "4:5",
        "width": 832, // Adjusted: (1024 * 4) / 5 = 819.2 (Rounded to 816 or 824 is better for encoding)
        "height": 1024
    },
    "tv": {
        "aspectRatio": "4:3",
        "width": 1360, // Adjusted: (1024 * 4) / 3 = 1365.3 (Use 1360 or 1376 for alignment)
        "height": 1024
    },
    "vertical": {
        "aspectRatio": "9:16",
        "width": 576,
        "height": 1024
    },
    "widescreen": {
        "aspectRatio": "16:9",
        "width": 1024,
        "height": 576
    },
    "ultrawide": {
        "aspectRatio": "21:9",
        "width": 1344, // Fixed: (576 / 9) * 21 = 1344
        "height": 576
    }
};

export const EXECUTION_MODE: "PARALLEL" | "SEQUENTIAL" = (() => {
    const envValue = process.env.EXECUTION_MODE as "PARALLEL" | "SEQUENTIAL" | undefined;
    if (envValue === "PARALLEL" || envValue === "SEQUENTIAL") {
        return envValue;
    }

    console.warn(" ! Execution mode is not defined or invalid. Setting to 'SEQUENTIAL'");
    return "SEQUENTIAL";
})();
