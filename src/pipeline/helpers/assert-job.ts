import { JobState } from "../../shared/types/job.types";

const transitions: Record<JobState, JobState[]> = {
    CREATED: [ "RUNNING", "CANCELLED" ],
    RUNNING: [ "COMPLETED", "FAILED", "CANCELLED" ],
    FAILED: [ "RUNNING", "FATAL", "CANCELLED" ],
    FATAL: [],
    COMPLETED: [],
    CANCELLED: [],
};

export function assertValidTransition(
    from: JobState,
    to: JobState
) {
    if (!transitions[ from ].includes(to)) {
        throw new Error(`Invalid job transition ${from} → ${to}`);
    }
}
