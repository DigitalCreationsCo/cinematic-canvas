// src/client/src/store/useJobStore.ts
// ─────────────────────────────────────────────────────────────────────────────
// Client-side job visibility store.
//
// Tracks all jobs the client has been made aware of during the current session.
// Jobs are never pruned from the store — completed / failed / cancelled jobs
// remain visible so the user can see a full run history without a page reload.
//
// Data flow:
//   1. On SSE connect → fetchActiveJobs() hydrates the store via REST.
//   2. Subsequent state transitions arrive as job events on the SSE stream
//      and are applied via setJobState() / upsertJob().
//   3. Cancel actions go through cancelJob() which calls the REST endpoint
//      pessimistically — the store updates reactively via the SSE JOB_CANCELLED
//      event, not optimistically.
//
// Performance notes:
//   - Jobs are keyed by id (Record<string, ClientJob>) for O(1) lookups.
//   - Store actions are stable Zustand references — safe to include in
//     dependency arrays without causing re-renders.
//   - Derived lists (active, byWorkflow, etc.) are exported as selector
//     functions and should be wrapped in useMemo at the call site.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { JobState, JobType } from '#shared/types/job.types.js';

// ─── Client-side job record ───────────────────────────────────────────────────
//
// A deliberately lightweight projection of the server-side Job entity.
// Heavy fields (payload, result, attempts, recoveryContext) are stripped —
// the client only needs enough to render a job list and handle cancellations.

export interface ClientJob {
    id: string;
    /** Discriminated job type (e.g. "GENERATE_SCENE_VIDEO"). */
    type: JobType;
    /** Current lifecycle state. */
    state: JobState;
    projectId: string;
    userId: string;
    teamId: string;
    /**
     * Non-null when the job was dispatched by a pipeline workflow run.
     * Null / undefined for standalone user-initiated jobs.
     */
    workflowId?: string | null;
    /** Last error message, if any. */
    error?: string;
    /** ISO timestamp — when the job was created (dispatched). */
    createdAt: string;
    /** ISO timestamp — when the job was last updated. */
    updatedAt: string;
}

// ─── Store state & actions ───────────────────────────────────────────────────

interface JobStoreState {
    /** All jobs known to this session, keyed by jobId. */
    jobs: Record<string, ClientJob>;
    /**
     * True once the initial REST fetch has resolved.
     * Components should show a loading skeleton until this is true.
     */
    isHydrated: boolean;

    // ── Actions ──────────────────────────────────────────────────────────────

    /**
     * Bulk-replace jobs from the REST hydration response.
     * Subsequent SSE events are layered on top via upsertJob / setJobState.
     */
    hydrateJobs: (jobs: ClientJob[]) => void;

    /**
     * Insert or replace a single job record.
     * Used for JOB_DISPATCHED events where the full job shape is known.
     */
    upsertJob: (job: ClientJob) => void;

    /**
     * Apply a state transition to an existing job.
     *
     * If the job is not yet in the store (race: SSE event arrived before
     * hydration), this is a no-op — the hydration fetch will either include
     * the job (if it is still active) or it has already reached a terminal
     * state that the client does not need to display.
     *
     * @param jobId   Target job.
     * @param state   New JobState.
     * @param error   Optional error message (for JOB_FAILED).
     */
    setJobState: (jobId: string, state: JobState, error?: string) => void;

    /** Wipe all job state — called by useSignOut. */
    clearAll: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useJobStore = create<JobStoreState>((set) => ({
    jobs: {},
    isHydrated: false,

    hydrateJobs: (jobList) =>
        set({
            // Merge rather than replace so that any jobs that arrived via SSE
            // between the fetch initiation and resolution are not lost.
            // New SSE data takes precedence over the REST snapshot for the same id.
            jobs: (state => {
                const fromRest = Object.fromEntries(jobList.map(j => [j.id, j]));
                return { ...fromRest, ...state.jobs };
            })(useJobStore.getState()),
            isHydrated: true,
        }),

    upsertJob: (job) =>
        set((state) => ({
            jobs: { ...state.jobs, [job.id]: job },
        })),

    setJobState: (jobId, jobState, error) =>
        set((state) => {
            const existing = state.jobs[jobId];
            if (!existing) return state; // Unknown job — safe no-op (see JSDoc above)
            return {
                jobs: {
                    ...state.jobs,
                    [jobId]: {
                        ...existing,
                        state: jobState,
                        updatedAt: new Date().toISOString(),
                        ...(error !== undefined ? { error } : {}),
                    },
                },
            };
        }),

    clearAll: () => set({ jobs: {}, isHydrated: false }),
}));

// ─── Selector helpers ─────────────────────────────────────────────────────────
//
// These are plain functions, not hooks — wrap them in useMemo at the call site:
//
//   const activeJobs = useMemo(
//     () => selectActiveJobs(useJobStore.getState()),
//     [jobs]  // jobs from useJobStore(s => s.jobs)
//   );

/** Jobs in PENDING or RUNNING state — the "in-flight" set. */
export const selectActiveJobs = (state: JobStoreState): ClientJob[] =>
    Object.values(state.jobs).filter(
        (j) => j.state === 'PENDING' || j.state === 'RUNNING'
    );

/** All jobs for a specific project, sorted newest first. */
export const selectJobsByProject = (projectId: string) =>
    (state: JobStoreState): ClientJob[] =>
        Object.values(state.jobs)
            .filter((j) => j.projectId === projectId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Jobs belonging to a pipeline workflow run (not user-initiated standalone jobs). */
export const selectWorkflowJobs = (workflowId: string) =>
    (state: JobStoreState): ClientJob[] =>
        Object.values(state.jobs).filter((j) => j.workflowId === workflowId);

/** Jobs the user started directly (not part of an agentic pipeline run). */
export const selectUserInitiatedJobs = (state: JobStoreState): ClientJob[] =>
    Object.values(state.jobs).filter((j) => !j.workflowId);