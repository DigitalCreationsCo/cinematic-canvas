---
title: Architecture Overview
description: High-level system design, core components, and distributed architecture of Cinematic Canvas.
keywords: ["architecture", "system design", "microservices", "pubsub", "persistence"]
---


# Core System Architecture

This document outlines the foundational architecture of the Cinematic Canvas generative pipeline. The system is designed as a **distributed, event-driven, and persistent** platform capable of handling complex, long-running generative workflows.

## 1. High-Level Architecture

The system follows a decoupled microservices pattern where the control plane (Client/Server) is separated from the execution plane (Pipeline/Workers). State is authoritative and persistent, ensuring resilience and restartability.

```mermaid
graph TD
    subgraph "Control Plane"
        Client[Frontend Client]
        Server[API Server]
    end

    subgraph "Message Bus (Pub/Sub)"
        Commands[pipeline-commands]
        JobEvents[job-events]
        StatusEvents[pipeline-events]
    end

    subgraph "Execution Plane"
        Pipeline[Pipeline Orchestrator]
        Worker[Generative Workers (Scaled)]
    end

    subgraph "Persistence"
        DB[(PostgreSQL)]
        Storage[Google Cloud Storage]
    end

    Client -->|HTTP| Server
    Server -->|Publish| Commands
    Server -->|SSE| Client
    
    Pipeline -->|Subscribe| Commands
    Pipeline -->|Publish| JobEvents
    Pipeline -->|Read/Write| DB
    
    Worker -->|Subscribe| JobEvents
    Worker -->|Publish| JobEvents
    Worker -->|Read/Write| Storage
    
    StatusEvents -->|Subscribe| Server
    Pipeline -->|Publish| StatusEvents
    Worker -->|Publish| StatusEvents
```

## 2. Core Components

### 2.1. Client & Server (Control Plane)
*   **Client**: A React-based frontend that issues commands and visualizes state. It holds **no authoritative logic** and never infers state; it renders strictly what the server pushes via Server-Sent Events (SSE).
*   **Server**: A stateless message router. It receives HTTP requests, validates them, and publishes commands to Pub/Sub. It also subscribes to status events to forward to connected clients.

### 2.2. Pipeline (Orchestration Layer)
The Pipeline service is the **brain** of the operation but executes no generative work itself.
*   **Responsibilities**:
    *   Hosts the LangGraph workflow execution.
    *   Manages the **Job Plane** (state machine).
    *   Reconciles job events into the authoritative workflow state.
    *   Dispatches job commands to the workers.
*   **State**: Fully persisted in PostgreSQL. Stateless between restarts.

### 2.3. Workers (Execution Layer)
Workers are the **muscles**. They are stateless, scalable consumers that execute specific generative tasks.
*   **Responsibilities**:
    *   Listen for job assignments via Pub/Sub.
    *   Execute generative model calls (LLM, Video Generation, etc.).
    *   Upload assets to Cloud Storage.
    *   Emit `JOB_PROGRESS` and `JOB_COMPLETED` events.
*   **Scaling**: Can be horizontally scaled from 0 to N based on queue depth.

### 2.4. Persistence (Source of Truth)
*   **PostgreSQL**: The single source of truth for Workflow State (Checkpoints) and Job State. All coordination relies on the DB, not in-memory state.
*   **Google Cloud Storage**: Stores large blobs (images, videos, audio) with versioned paths.

## 3. Distributed Coordination

### 3.1. Shared State & Locking
To support multiple active workers and prevent race conditions:
*   **Distributed Locking**: Critical sections (like project initialization) use Postgres-based locks to ensure only one entity modifies specific state at a time.
*   **Idempotency**: All operations are designed to be idempotent. Re-processing a completion event for a finished job is safe and ignored.

#### Advisory Locks vs. Distributed Lock Manager (DLM)
In the graph-based system, choosing the right lock depends on the Duration and Failure Mode of the task.

| Feature | Advisory Locks (Transaction-level) | Distributed Lock Manager (Table-based) |
| :--- | :--- | :--- |
| **Best For** | High-Frequency Coordination: Claiming jobs, incrementing counters. | Process Governance: Long-running renders, maintaining "ownership". |
| **Cleanup** | Automatic: If process crashes, lock is released. | TTL/Heartbeat: Requires timeout or watcher. |
| **Performance** | Near-Zero Overhead (Postgres RAM). | Higher Overhead (Disk I/O). |
| **Safety** | Prevents two workers from starting same micro-task. | Prevents two servers from managing same Project. |

**Rule of Thumb**: Use Advisory Locks inside `claimJob` logic. Use LockManager table for Project-level Mutex.

### 3.2. Versioning & Concurrency
*   **Storage**: Files are not overwritten but versioned (e.g., `scene_001_v2.mp4`). Workers query postgres to determine the next available version number before generation, preventing race conditions.

## 4. Pub/Sub Architecture

Pub/Sub acts as the asynchronous boundary, ensuring decoupling and buffering.

### 4.1. Topics
*   **`pipeline-commands`**: Control signals (`START`, `STOP`, `RETRY`) from Server to Pipeline.
*   **`job-events`**: The workhorse topic.
    *   Pipeline publishes `JOB_DISPATCHED`.
    *   Workers publish `JOB_STARTED`, `JOB_PROGRESS`, `JOB_COMPLETED`, `JOB_FAILED`.
*   **`pipeline-events`**: User-facing status updates (`SCENE_GENERATED`, `ERROR`) forwarded to the Client via SSE.
*   **`pipeline-cancellations`**: Broadcast topic to signal all workers to abort specific project tasks immediately.

## 5. Reliability & Retries

### 5.1. Human-in-the-Loop Retries (`retryLlmCall`)
The system uses a controlled retry loop powered by **LangGraph Interrupts**.
*   **Mechanism**: On failure, execution pauses and exposes the error to the user.
*   **Intervention**: The user can inspect the failure, modify parameters, and resume.

### 5.2. Graceful Cancellation
*   **`STOP_PIPELINE`**: immediately halts workflow execution.
*   **Cleanup**: In-progress generation is aborted, and state is checkpointed.

### 5.3. Checkpointing
State is saved to Postgres:
1.  **Before** generation (intent).
2.  **After** job dispatch.
3.  **On** job completion.
