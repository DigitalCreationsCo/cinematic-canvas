# Canvas Node Layout System - Analysis & Optimization Instructions

## Overview

This document provides comprehensive instructions for analyzing and optimizing the canvas node layout functionality in Cinematic Canvas, including positioning transformations, node memoization, HybridNodeStorage persistence, layout loading/recalling, and memory management.

---

## 1. SYSTEM ARCHITECTURE

### 1.1 Core Files

| File | Purpose |
|------|---------|
| `src/client/src/store/useNodeStore.ts` | Zustand store for React Flow state (nodes, edges, viewport) with zundo undo/redo |
| `src/client/src/store/useCanvasPipelineSync.ts` | Bridge between SSE pipeline events and ReactFlow canvas |
| `src/client/src/store/useCanvasUIStore.ts` | UI state (autoLayout, snapToGrid, selection) |
| `src/client/src/services/hybridNodeStorage.ts` | Dual-tier (IndexedDB + Supabase) layout persistence |
| `src/client/src/store/middleware/canvasIndexedDBStorage.ts` | Debounced persistence wrapper |
| `src/client/src/pages/ProjectBuilderCanvas.tsx` | Project canvas page |
| `src/client/src/pages/WorldBuilderCanvas.tsx` | World canvas page |
| `src/client/src/domain/canvas/CoordinateSystem.ts` | Coordinate transformations, grid snapping, auto-layout |

### 1.2 Data Flow

```
SSE Events → useProjectStore → useCanvasPipelineSync → useNodeStore → ReactFlow
                ↑                    ↓
            IndexedDB ←── fetch() ←── Persisted Layouts
                ↑
            upsert() ←── debouncedPersistLayout()
```

---

## 2. IDENTIFIED ISSUES

### 2.1 Critical Bugs

#### BUG-1: Cloud Sync is Write-Only (Never Fetches)
- **Location**: `useCanvasPipelineSync.ts`, `WorldBuilderCanvas.tsx`
- **Issue**: `storage.fetch(projectId)` only reads from IndexedDB. `fetch(projectId, { syncFromServer: true })` is **never called** in production.
- **Impact**: Users switching devices or clearing browser data lose their layouts.
- **Fix**: Pass `{ syncFromServer: true }` to `storage.fetch()` when loading layouts.

#### BUG-2: Unsynced Changes Never Retried
- **Location**: `hybridNodeStorage.ts` - `forceSyncUnsynced()` is implemented but never called.
- **Issue**: If background Supabase upsert fails (network error), data stays in IndexedDB with `tsSynced: null` but never syncs again.
- **Impact**: Data loss on network failures.
- **Fix**: Call `storage.forceSyncUnsynced()` on canvas mount or application startup.

#### BUG-3: OCC Race Condition in Background Upserts
- **Location**: `HybridNodeStorage.upsert()` line 376
- **Issue**: `supabaseAdapter.upsert()` is called asynchronously without awaiting or queuing. Multiple upserts can be in flight. If they arrive out of order, newer updates are silently dropped due to OCC (`eq('idx_version', node.idxVersionCurrent)`).
- **Impact**: Cloud permanently out of sync with local state on rapid changes.
- **Fix**: Implement a queue for sequential upsert execution, or await the Supabase upsert before returning.

#### BUG-4: Missing Unmount Flush
- **Location**: `canvasIndexedDBStorage.ts`
- **Issue**: `debouncedPersistLayout` uses 1300ms debounce. If user closes tab or navigates away before timeout fires, latest layout changes are lost.
- **Impact**: Data loss on navigation/unload.
- **Fix**: Add `flush()` method and call it on `beforeunload` and component unmount.

#### BUG-5: WorldBuilderCanvas Race Condition
- **Location**: `WorldBuilderCanvas.tsx` lines 56-99
- **Issue**: If user rapidly switches worlds, the fetch for World A might resolve AFTER component has switched to World B, overwriting World B's canvas with World A's nodes.
- **Impact**: Incorrect world data displayed.
- **Fix**: Add `isMounted` flag to ignore stale fetch responses.

### 2.2 Performance Issues

#### PERF-1: High-Frequency Persistence Effect
- **Location**: `ProjectBuilderCanvas.tsx` line 207
- **Issue**: `useEffect` depends on `nodes` array, triggering on every frame during drag. Effect executes 60 times/second while dragging, recreating closures unnecessarily.
- **Impact**: Unnecessary React fiber work, potential GC pressure.
- **Fix**: Subscribe to `onNodeDragStop` event instead of `nodes` array, or use a ref to track "dirty" state.

#### PERF-2: O(N) Array Lookups for Grid Position
- **Location**: `useCanvasPipelineSync.ts` lines 147-167
- **Issue**: `Array.from(scenes.values()).findIndex(...)` is O(N) for every spawn.
- **Impact**: Slow project initialization with many entities.
- **Fix**: Maintain a `Map<id, index>` or compute index once during store subscription.

### 2.3 Memory Issues

#### MEM-1: Global Store Never Cleared on Unmount
- **Location**: Both canvas pages
- **Issue**: Neither `ProjectBuilderCanvas` nor `WorldBuilderCanvas` clears `useNodeStore` on unmount. Navigating away leaves thousands of nodes/edges in memory.
- **Impact**: Memory grows indefinitely.
- **Fix**: Add cleanup function to clear nodes on unmount.

#### MEM-2: setTimeout Leak in handleFileDrop
- **Location**: `ProjectBuilderCanvas.tsx` lines 129-131
- **Issue**: `setTimeout(() => { isProcessingDropRef.current = false; }, 100)` not cleared on unmount.
- **Impact**: Minor memory leak.
- **Fix**: Clear timeout in unmount cleanup.

---

## 3. REQUIRED OPTIMIZATIONS

### 3.1 Performance Optimizations

#### OPT-1: Optimize useCanvasPipelineSync
- Use `Map` instead of `Array.findIndex()` for entity lookups
- Memoize grid position calculations
- Batch node additions when possible

#### OPT-2: Optimize NodeGraph Rendering
- Ensure `useMemo` in `renderNodes` properly prevents unnecessary re-renders
- Consider virtualization for projects with 100+ nodes
- Verify React Flow's `nodeExtent` and `minZoom`/`maxZoom` are set

#### OPT-3: Debounce React Flow State Updates
- Current: `makeCanvasStateDebounce(1000ms)` for zundo
- Consider: Lower debounce for position updates vs. structural changes

### 3.2 Caching Strategy

#### OPT-4: Cache Persisted Layouts
- Store fetched layouts in memory during session to avoid repeated IndexedDB reads
- Invalidate cache on write operations

### 3.3 React Flow Optimization

#### OPT-5: Node Memoization
- Verify all custom nodes use `React.memo()`
- Ensure node components don't recreate objects in render

---

## 4. LAYOUT PERSISTENCE LIFECYCLE

### 4.1 Save Flow
```
User drags/resizes node
  → ReactFlow updates node position
  → useEffect fires (depends on nodes)
  → debouncedPersistLayout(nodes, contextId, contextType)
  → setTimeout(1300ms)
  → hybridStorage.upsert(payload)
  → IndexedDB updated immediately
  → Supabase upsert fires async (if enabled)
  → onResult callback updates idxVersion in store
```

### 4.2 Load Flow (Projects)
```
ProjectBuilderCanvas mounts
  → useEffect clears nodes (setNodes([]))
  → useCanvasPipelineSync effect fires
  → storage.fetch(projectId) → layouts from IndexedDB
  → For each layout: updateNodePosition, updateNodeData
  → ProjectStore entities loaded via SSE
  → Subscribers spawn remaining nodes (if not in spawnedIds)
```

### 4.3 Load Flow (Worlds)
```
WorldBuilderCanvas mounts
  → useEffect fires for worldId
  → storage.fetch(worldId)
  → Root node created
  → For each layout: create node or update position
  → store.setNodes(allNodes)
```

---

## 5. TESTING REQUIREMENTS

### 5.1 Unit Tests
- [ ] HybridNodeStorage: 94% coverage achieved (58 tests)
- [ ] useNodeStore: Add tests for updateNodePosition, deleteNode
- [ ] useCanvasPipelineSync: Test spawnEntity, gridPosition logic

### 5.2 Integration Tests
- [ ] Layout persistence end-to-end: Save → Reload → Verify positions
- [ ] Project switching: Clear old nodes, load new project
- [ ] World switching: Verify race condition fix

### 5.3 Performance Tests
- [ ] Measure render time with 100, 500, 1000 nodes
- [ ] Profile drag performance
- [ ] Memory usage over extended sessions

---

## 6. IMPLEMENTATION CHECKLIST

### Phase 1: Critical Bug Fixes
- [ ] Add `{ syncFromServer: true }` to storage.fetch() calls
- [ ] Call forceSyncUnsynced() on canvas mount
- [ ] Fix WorldBuilderCanvas race condition with isMounted flag
- [ ] Add flush() to canvasIndexedDBStorage and call on beforeunload

### Phase 2: Performance Optimizations
- [ ] Replace Array.findIndex() with Map lookup in useCanvasPipelineSync
- [ ] Change persistence trigger from useEffect(nodes) to onNodeDragStop
- [ ] Add node memoization verification

### Phase 3: Memory Management
- [ ] Add unmount cleanup to clear useNodeStore
- [ ] Clear setTimeout in handleFileDrop
- [ ] Add memory profiling instrumentation

### Phase 4: Testing & Validation
- [ ] Run existing 58 HybridNodeStorage tests
- [ ] Add integration tests for persistence
- [ ] Performance regression tests

---

## 7. SUCCESS CRITERIA

| Metric | Target |
|--------|--------|
| Layout persistence | 100% of saves persist across sessions |
| Layout loading | Persisted positions correctly restored |
| Cross-device sync | Layouts available after device switch (when cloud enabled) |
| Render performance | 60fps during drag with 100+ nodes |
| Memory | Stable memory usage, no unbounded growth |
| Test coverage | 100% HybridNodeStorage, 80%+ useCanvasPipelineSync |

---

## 8. ROLLBACK PLAN

If optimizations introduce regressions:
1. Revert to grid position spawning (current behavior in useCanvasPipelineSync)
2. Disable cloud sync if data integrity issues arise
3. Restore useEffect(nodes) persistence trigger if onNodeDragStop causes issues

---

## 9. RELATED FILES TO INSPECT

### Core Layout System
- `src/client/src/store/useCanvasPipelineSync.ts` - Primary sync logic
- `src/client/src/store/useNodeStore.ts` - Zustand store
- `src/client/src/services/hybridNodeStorage.ts` - Persistence layer

### Coordinate System
- `src/client/src/domain/canvas/CoordinateSystem.ts` - Grid, snap, auto-layout
- `src/client/src/domain/canvas/NodeFactory.ts` - Node creation

### React Flow Integration
- `src/client/src/components/canvas/NodeGraph.tsx` - ReactFlow wrapper
- `src/client/src/components/canvas/nodes/*.tsx` - Custom node components

### Pages
- `src/client/src/pages/ProjectBuilderCanvas.tsx` - Project canvas
- `src/client/src/pages/WorldBuilderCanvas.tsx` - World canvas
