---
trigger: glob
globs:
  - src/client/src/components/canvas/**
  - src/client/src/domain/canvas/**
  - src/client/src/hooks/use*Canvas*.ts
  - src/client/src/hooks/useSavePendingChanges.ts
  - src/client/src/pages/*Canvas.tsx
  - src/client/src/services/hybridNodeStorage.ts
  - src/client/src/store/useCanvasPipelineSync.ts
  - src/client/src/store/useNodeStore.ts
  - src/client/src/store/middleware/canvasIndexedDBStorage.ts
---

# Canvas Hybrid Node Storage

Use `HybridNodeStorage` as the single client storage abstraction for canvas node layout state.

## Client rules

- Load canvas layouts through `getHybridNodeStorage(supabase).fetch(contextId, { syncFromServer: true, contextType })` during canvas initialization.
- Always pass the explicit `contextType` (`project` or `world`) when hydrating from storage so server-synced rows are re-materialized into IndexedDB with the correct scope.
- Persist node position, size, UI metadata, and node existence through `HybridNodeStorage.upsert()` and `HybridNodeStorage.delete()`. Do not introduce direct `canvas_node_layouts` writes from client canvas code.
- Route debounced canvas persistence through `src/client/src/store/middleware/canvasIndexedDBStorage.ts`; do not bypass it from React Flow event handlers.
- Restore and persist viewport state with `getViewport()` and `saveViewport()` on the same storage singleton.

## Data model

- `idxVersion` is the optimistic concurrency token for each layout row. Keep `node.data.idxVersion` aligned with storage results after successful persists.
- Persist canvas-only UI state in `jsonUiMetadata`. Current canvas code uses it for flags such as `collapsed`, `pipelineSelected`, `nodeTypeFlag`, and `pendingChangeCount`.
- `HybridNodeStorage` writes to IndexedDB first, then optionally syncs to cloud storage. Treat IndexedDB as the immediate client source of truth and cloud sync as reconciliation.

## Server boundary

- Server-side atomic relationship commits still happen through the server-only exports in `hybridNodeStorage.ts`, especially `confirmCanvasChanges(...)`.
- `confirmCanvasChanges(...)` is for committing edge-driven entity/asset mutations in one transaction. It is not the client API for node layout persistence.
- Keep client canvas code on the storage singleton and keep transactional project/world mutations on the server router path.

## Operational guidance

- After initial load, call `forceSyncUnsynced()` to retry local writes that missed cloud sync.
- When deleting nodes from canvas state, delete the persisted layout through `HybridNodeStorage` at the same time so IndexedDB, cloud layout state, and React Flow stay aligned.
- Avoid reintroducing duplicate helpers like `canvasLayoutSync` or `canvasLayoutService`; extend `HybridNodeStorage` instead.
