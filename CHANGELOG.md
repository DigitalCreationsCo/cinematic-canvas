# Changelog: Distributed Architecture & Monorepo Restructuring

## Overview
This update represents a fundamental architectural shift for the Cinematic Framework, transitioning from a monolithic worker pattern to a **decoupled, distributed control plane architecture**. The codebase has been reorganized into a standard monorepo structure (`src/`), separating orchestration concerns from heavy compute execution.

This restructuring enables independent scaling of workflow management (state/logic) and generative tasks (rendering/inference), while improving type safety and developer ergonomics across the stack.

---

## 🏗️ Architectural Changes

### 1. The "Split Brain" Architecture: Pipeline vs. Worker
We have decoupled the monolithic `pipeline-worker` into two distinct services with specialized responsibilities:

*   **`src/pipeline` (Control Plane)**:
    *   **Responsibility**: Acts as the workflow orchestrator. It manages the LangGraph state machine, handles Pub/Sub commands (`START`, `STOP`, `REGENERATE`), and maintains the "Brain" of the operation.
    *   **State Management**: Now uses `PostgresCheckpointer` for robust, persistent state tracking across service restarts, replacing in-memory volatility.
    *   **Concurrency**: Implements a `DistributedLockManager` to prevent race conditions on project resources.

*   **`src/worker` (Data Plane)**:
    *   **Responsibility**: Dedicated to heavy "muscle" work. It listens for discrete `JOB_DISPATCHED` events to execute computationally expensive tasks (like video rendering or model inference) without blocking the orchestration logic.
    *   **Scalability**: This separation allows the worker pool to scale horizontally based on job queue depth, independently of the pipeline's decision-making throughput.

### 2. Monorepo Organization (`src/`)
The project file structure has been standardized to reduce root clutter and improve maintainability:

*   **`client/` → `src/client/`**: Frontend application source.
*   **`server/` → `src/server/`**: API and command gateway.
*   **`pipeline/` → `src/workflow/`**: Core LangGraph definitions, agents, and business logic (the "What").
*   **`pipeline-worker/` → `src/pipeline/` & `src/worker/`**: Service entry points (the "How").
*   **`shared/` → `src/shared/`**: Common types, schemas, and utilities shared across all services.

### 3. State Persistence & Resilience
*   **Postgres-Backed Checkpointing**: The transition to `PostgresSaver` ensures that workflow state is durably stored. This enables the system to recover from crashes and resume long-running video generation workflows exactly where they left off.
*   **Asset Tracking**: Enhanced `GCPStorageManager` logic to track asset versioning (`attempts`) explicitly in the database state rather than relying solely on file system scanning, reducing latency and "state drift."

---

## 🛠️ Technical Improvements

*   **Type Safety**:
    *   Consolidated Zod schemas into `src/shared/schema.ts` and `src/shared/types/`.
    *   Integration of `zod-to-drizzle` for tighter coupling between runtime validation and database schema definitions.

*   **Docker Orchestration**:
    *   Updated `docker-compose.yml` and `docker-compose.debug.yml` to define the separate `pipeline` and `worker` services.
    *   Configurations for debugging now support attaching to specific services independently (e.g., "Docker: Attach to Pipeline" vs. "Docker: Attach to Worker").

*   **Developer Experience**:
    *   **VSCode Launch Configs**: New configurations added to debug the specific services (`src/pipeline/index.ts`, `src/worker/index.ts`) and the frontend separately or together.
    *   **Hot Reloading**: Enhanced `vite-node` integration for server-side hot reloading during development.

---

## 🚀 User Experience Benefits

*   **Reliability**: The distributed locking and persistent state mean fewer "stuck" generations. If a worker crashes, the job can be retried without losing the entire project's progress.
*   **Responsiveness**: By offloading heavy compute to the `worker` service, the `pipeline` service remains responsive to user commands (like "Stop" or "Regenerate") even while a video is rendering.
*   **Observability**: Clearer separation of logs between "deciding what to do" (Pipeline) and "doing the work" (Worker) aids in faster troubleshooting of failed generations.

## ⚠️ Breaking Changes

*   **Environment Variables**: New configuration required for `POSTGRES_URL` (mandatory for state persistence) and `EXECUTION_MODE` (Sequential vs. Parallel).
*   **Entry Points**: `npm run pipeline:start` and `npm run worker:start` now point to their respective `src/` locations.
*   **Database Schema**: New migrations required to support the `checkpoints` and `project_locks` tables.
