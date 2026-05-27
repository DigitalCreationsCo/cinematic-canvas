# Workflow Control & Versioning

## Overview

Cinematic Canvas distinguishes between **User-Facing Versions** (creative iterations) and **System Retries** (transient failure handling). This ensures that users see a clean history of their creative choices, while the system handles robustness under the hood.

## 1. Asset Versioning (Creative Iteration)

An **Asset Version** represents a distinct creative attempt requested by you.
*   *Example*: "Scene 1, Version 1" (Initial idea) -> "Scene 1, Version 2" (New prompt).

### Key Behaviors
*   **Immutable**: Once a version is finalized, it is locked.
*   **Sequential**: Versions increment linearly (v1, v2, v3).
*   **User Visible**: These are the versions you select in the UI timeline.

## 2. System Retries (Robustness)

A **System Retry** happens when the backend encounters a technical error (e.g., API timeout, GPU crash) or a quality failure.

*   **Invisible**: These do not increment the Asset Version.
*   **Tracked**: We track `retry_count` internally for debugging.
*   **Limited**: The system will retry a set number of times (default: 3) before marking the Version as `FAILED`.

## 3. Workflow Commands

The pipeline is controlled via explicit commands sent to the backend.

| Command | Action | Effect on Versioning |
| :--- | :--- | :--- |
| **`START_PIPELINE`** | Begins a new project or resumes. | Creates Version 1 for new scenes. |
| **`GENERATE_SCENE`** | Re-rolls a specific scene. | Creates **New Version** (e.g., v1 -> v2). |
| **`RETRY_SCENE`** | Retries the *current* version. | increments internal retry count only. |
| **`STOP_PIPELINE`** | Pauses execution. | Saves current state checkoint. |

## 4. Job Identity

To manage these processes, every job is uniquely identified by:
`{projectId}-{nodeName}-{sceneId}-{attemptNumber}`

This ensures that even if multiple workers are running, they never overwrite each other's work.
