# State Persistence Implementation Plan

## Objective
Implement robust state persistence to prevent data loss during worker crashes or process interruptions. The system should save the full workflow state to Google Cloud Storage (GCS) and use it as a fallback when the primary checkpoint (Postgres) is unavailable.

## Implementation Steps

### 1. Storage Layer Upgrade
**File:** `pipeline/storage-manager.ts`
- **Action:** Update `GcsObjectType` and path generation.
- **Details:**
  - Add `'state'` to `GcsObjectType`.
  - Update `getGcsObjectPath` to map `'state'` type to `[videoId]/state.json`.

### 2. Workflow Graph Enhancements
**File:** `pipeline/graph.ts`
- **Action:** Implement state saving and improved initialization.
- **Details:**
  - Add helper method `saveStateToStorage(state: GraphState)` to `CinematicVideoWorkflow`.
  - Inject `saveStateToStorage` calls at the end of all critical nodes:
    - `expand_creative_prompt`
    - `generate_storyboard_exclusively_from_prompt`
    - `create_scenes_from_audio`
    - `enrich_storyboard_and_scenes`
    - `generate_character_assets`
    - `generate_location_assets`
    - `generate_scene_assets`
    - `process_scene`
    - `render_video`
    - `finalize`
  - **Critical Change:** Update `execute` method's initialization logic.
    - **Current:** If checkpointer exists, load from it. If empty, start fresh.
    - **New:** If checkpointer exists, load from it. If **empty**, fallback to loading `state.json` from GCS. If that fails, fallback to `storyboard.json`.

### 3. Worker Service Logic
**File:** `pipeline-worker/workflow-service.ts`
- **Action:** Align worker operations with new persistence hierarchy.
- **Details:**
  - `startPipeline`: Prioritize `state.json` over `storyboard.json` when building initial state if no active checkpoint exists.
  - `resumePipeline`: If `checkpointer.loadCheckpoint` returns null, attempt to load `state.json` and restart the workflow with that state (effectively resuming).
  - `getFullState`: Implement the full hierarchy for state retrieval:
    1. **Checkpointer** (Postgres) - Most up-to-date.
    2. **State File** (GCS `state.json`) - Durable backup.
    3. **Storyboard** (GCS `storyboard.json`) - Legacy/Partial fallback.

## Recovery Hierarchy
The system will resolve state in the following order of precedence:
1. **Active Checkpoint (Postgres/Memory):** The granular, latest state of the graph execution.
2. **Persistent State File (GCS `state.json`):** A durable snapshot saved after every major step.
3. **Storyboard File (GCS `storyboard.json`):** The initial production plan (used only if no execution state exists).
4. **Fresh Start:** Initialize new state from inputs.
