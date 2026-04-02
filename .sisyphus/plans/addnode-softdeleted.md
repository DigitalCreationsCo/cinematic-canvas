# Plan: Ensure isSoftDeleted is False When Adding Nodes

## Objective
Modify `addNode` in the node store to always set `isSoftDeleted: false` when a node is added to the canvas. This ensures that previously soft-deleted nodes that are re-added to the canvas appear normally (not transparent/grayed out).

## Change Details

**File:** `src/client/src/store/useNodeStore.ts`

**Current Implementation (line 102):**
```typescript
addNode: (node) => set({ nodes: [...get().nodes, node] }),
```

**New Implementation:**
```typescript
addNode: (node) => {
  // Always ensure isSoftDeleted is false when adding a node to canvas.
  // This handles the case where a previously soft-deleted node is restored.
  const nodeWithRestore = {
    ...node,
    data: { ...node.data, isSoftDeleted: false },
  };
  // Remove from softDeletedNodes if it was there (restored node case)
  const softDeletedNodes = get().softDeletedNodes.filter(
    (id) => id !== node.id,
  );
  set({
    nodes: [...get().nodes, nodeWithRestore],
    softDeletedNodes,
  });
},
```

## What This Does

1. **Sets `isSoftDeleted: false`** on the node data before adding — ensures the node renders fully opaque (not transparent)
2. **Removes from `softDeletedNodes` array** if it was previously soft-deleted — cleans up the tracking array for restored nodes

## Scope

- **IN:** Modify `addNode` function in `useNodeStore.ts`
- **OUT:** No UI changes, no other files

## Verification

- [ ] Verify node appears opaque after re-adding a previously deleted node
- [ ] Verify existing tests still pass
