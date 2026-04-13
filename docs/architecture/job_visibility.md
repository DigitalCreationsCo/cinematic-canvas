# Job Visibility — Implementation Guide

## Files Produced

| File | Action |
|------|--------|
| `job.types.ts` | Replace `JobEvent` section + add `buildJobEventMetadata` helper |
| `pubsub-event-bus.ts` | Drop-in replacement (`userId` attribute added to `publishJobEvent`) |
| `job-control-plane.ts` | Drop-in replacement (see changes below) |
| `worker-service.CHANGES.ts` | Diff guide — apply the 3 call-site changes manually |
| `ttl-cache.ts` | New file → `src/server/services/ttl-cache.ts` |
| `index_routes.ADDITIONS.ts` | Diff guide — apply additions to `createIndexRouter` |
| `api-routes.ts` | Drop-in (apply to both server-local AND shared copies) |
| `useJobStore.ts` | New file → `src/client/src/store/useJobStore.ts` |
| `usePipelineEvents.ts` | Drop-in replacement |

---

## Change-by-change notes

### 1. `job.types.ts`
- `JobEvent` union now requires `userId`, `teamId`, `metadata: JobEventMetadata` on every variant.
- `JobEventMetadata` carries `type: JobType` + optional `workflowId` — lets clients display job labels and lets the server identify pipeline-owned jobs without a DB round-trip.
- `buildJobEventMetadata(job)` is a pure helper that constructs the metadata object from any object that has `type` and `workflowId`.
- Added `TERMINAL_JOB_STATES` (Set) and `ACTIVE_JOB_STATES` (readonly array) as shared constants — used in both `job-control-plane.ts` and `index_routes`.

### 2. `pubsub-event-bus.ts`
- `publishJobEvent` now publishes `userId` as a PubSub message attribute.
- Without this, the `filter: attributes.userId = "..."` in the per-session SSE subscription would be silently ignored, causing all job events to fan-out to every connected client.

### 3. `job-control-plane.ts`
- `createJob`: emits full `JobEvent` (userId, teamId, metadata) from the returned DB row.
- `cancelJob`: **new signature** `(jobId, projectId, userId, teamId) → CancelJobResult`. Uses a single conditional UPDATE (`WHERE state = 'PENDING'`) — no extra read in the happy path. If the update misses, a follow-up select determines the precise reason (NOT_FOUND | RUNNING | ALREADY_TERMINAL). Publishes `JOB_CANCELLED` only on success.
- `listActiveJobs(projectId)`: partial-select query returning only identity + state columns. Used by the REST endpoint.
- `cancelPendingJobsByWorkflow(workflowId, projectId, userId, teamId)`: bulk-cancels all PENDING jobs with matching `workflowId`. **Call this from the pipeline service's STOP_PIPELINE handler.** RUNNING jobs are deliberately skipped.

### 4. `worker-service.ts`
Three call-sites require manual edits (see `worker-service.CHANGES.ts`):
- `JOB_STARTED` — inside the `try` block after `claimJob` succeeds.
- `JOB_COMPLETED` — after `updateJobSafe` on the success path.
- `JOB_FAILED` — in the outer `catch` block.

All three have access to `job.userId`, `job.teamId`, `job.type`, and `job.workflowId`. Add the import:
```ts
import { buildJobEventMetadata } from "../shared/types/job.types.js";
```

### 5. `ttl-cache.ts`
Generic `TtlCache<V>` — string-keyed, lazy eviction on `get()`, eager eviction via `prune()`.
Instantiate inside `createIndexRouter` (closure scope):
```ts
const JOBS_CACHE_TTL_MS = 15_000;
const jobsCache = new TtlCache<ActiveJobRecord[]>();
```
Run `setInterval(() => jobsCache.prune(), 60_000)` if you expect many distinct projectIds over a long uptime.

### 6. `index_routes.ts` additions
Two new routes (see `index_routes.ADDITIONS.ts` for full bodies):
- **`GET /project/:projectId/jobs`** — queries non-terminal jobs, caches for 15 s.
- **`DELETE /project/:projectId/jobs/:jobId`** — conditional cancel + event publish + cache invalidation.

One modification to `getProjectEvents`:
- Adds a second ephemeral subscription `sse-jobs-{projectId}-{userId}-{sessionId}` to the job-events topic.
- In-process guard (`if jobEvent.userId !== userId return`) ensures correctness in InMemory (monolith) mode where the broker filter is not applied.
- Cleanup block unsubscribes both channels on `req.close`.

Also add these imports to the top of `index_routes.ts`:
```ts
import { TtlCache } from "../services/ttl-cache.js";
import { inArray, desc } from "drizzle-orm";
import { JobEvent, ACTIVE_JOB_STATES } from "../../shared/types/job.types.js";
import type { ActiveJobRecord } from "../../shared/services/job-control-plane.js";
```

### 7. `api-routes.ts`
Add the `jobs` section to both the server-local copy and the shared/client copy. The `api.jobs.list(projectId)` and `api.jobs.cancel(projectId, jobId)` helpers are used in routes and `usePipelineEvents`.

### 8. `useJobStore.ts`
Zustand store with:
- `jobs: Record<string, ClientJob>` — O(1) lookup by jobId.
- `hydrateJobs()` — merges REST snapshot into store (SSE-received data wins on conflict).
- `upsertJob()` — creates or replaces a single entry (JOB_DISPATCHED).
- `setJobState()` — safe no-op if jobId unknown (handles SSE-before-hydration race).
- `clearAll()` — for sign-out.
- Exported selectors: `selectActiveJobs`, `selectJobsByProject`, `selectWorkflowJobs`, `selectUserInitiatedJobs`.

### 9. `usePipelineEvents.ts`
- Pulls `hydrateJobs`, `upsertJob`, `setJobState` from `useJobStore`.
- `handleOpen` now calls `fetchActiveJobsForProject()` in parallel with `requestFullState()` — these are independent data paths and do not block each other.
- `handleMessage` switch handles all five job event types. Terminal events (COMPLETED, FAILED, CANCELLED) update state but do **not** remove the job from the store.
- `buildClientJobFromEvent()` constructs a `ClientJob` from a `JOB_DISPATCHED` SSE event — used for the case where a dispatch event arrives before REST hydration resolves.

---

## STOP_PIPELINE → cancel workflow jobs

The pipeline service (not modified in this PR) should call:
```ts
await jobControlPlane.cancelPendingJobsByWorkflow(
  workflowId,
  projectId,
  userId,
  teamId,
);
```
from its `STOP_PIPELINE` command handler, **before or after** stopping the graph.
Each cancelled job emits a `JOB_CANCELLED` event which propagates to all SSE clients.

---

## Data flow summary

```
User clicks Cancel Job
        │
        ▼
DELETE /project/:projectId/jobs/:jobId   (REST)
        │
        ├─ UPDATE jobs SET state='CANCELLED' WHERE state='PENDING'
        │
        ├─ eventBus.publishJobEvent({ type: 'JOB_CANCELLED', ... })
        │
        └─ jobsCache.invalidate(projectId)

JobEvent topic (PubSub / InMemory)
        │  filter: projectId + userId
        ▼
SSE session subscription (per client tab)
        │
        ▼
usePipelineEvents handleMessage → case 'JOB_CANCELLED'
        │
        ▼
useJobStore.setJobState(jobId, 'CANCELLED')
        │
        ▼
UI re-renders job list
```

---

## Edge cases handled

| Scenario | Handling |
|----------|----------|
| Cancel a RUNNING job | 409 + `reason: "RUNNING"` — client shows error, store unchanged |
| Cancel an already-terminal job | 409 + `reason: "ALREADY_TERMINAL"` |
| Cancel a non-existent job | 404 |
| SSE job event arrives before REST hydration | `upsertJob` on DISPATCHED; `setJobState` is no-op for unknown ids on other events — hydration fetch catches it |
| Worker claims job between cancel check and UPDATE | Conditional UPDATE (`WHERE state='PENDING'`) is atomic — one wins, the other is a no-op |
| Multiple tabs open simultaneously | Each SSE session has its own ephemeral subscription; both receive job events |
| InMemory event bus (monolith / dev) | In-process `userId` + `projectId` guard in `jobEventHandler` ensures correct routing |
| SSE reconnect | `handleOpen` re-fetches active jobs — store merges (SSE-delivered state wins on conflict) |