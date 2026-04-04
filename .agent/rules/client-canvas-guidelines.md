---
trigger: glob
globs: src/client
---

# Canvas Development Guidelines

This guide outlines required setup and best practices for developing canvas-related features in the Cinematic Canvas application, specifically focusing on React Flow DAG canvases and HTML5 Canvas animations.

## Overview

The canvas system consists of two main components:
1. **React Flow DAG Canvas** - Interactive node-based editor for managing projects and worlds
2. **HTML5 Canvas Background** - Animated visual effects (EllipsoidMatrix)

Both components require careful attention to setup and performance to maintain smooth interactions.

---

## 1. Required React Flow Setup ⚠️

**CRITICAL: These requirements must be followed or the canvas will not function properly.**

### Required CSS Import

Every file that renders ReactFlow components MUST import the React Flow styles:

```typescript
import '@xyflow/react/dist/style.css';
```

**Location**: Add this import at the top of any file containing `<ReactFlow>`, `<NodeGraph>`, or similar canvas components.

**Why**: Without this import, React Flow's internal styling is broken, causing:
- Click events not being captured
- Nodes not responding to clicks
- MiniMap and Controls not visible
- Edge rendering issues

### Required ReactFlow Props

Always set explicit dimensions and pointer events on ReactFlow:

```tsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}
  // ... other props
>
```

**Why**: Without explicit dimensions, ReactFlow may not fill its container properly. The `pointerEvents: 'auto'` ensures click events are captured.

### Required fitView Prop

Include `fitView` for proper initial viewport:

```tsx
<ReactFlow
  fitView
  // ... other props
>
```

### Required Background Component

Add the Background component inside ReactFlow for proper grid rendering:

```tsx
<ReactFlow ...>
  <Background gap={30} size={1} color="var(--border)" />
  {/* ... other children */}
</ReactFlow>
```

**Why**: This renders the grid pattern inside ReactFlow's coordinate system. Without it, the background appears on top of nodes.

---

## 2. Sidebar and Canvas Layout

### Positioning Pattern

For proper click event handling, use this layout pattern:

```tsx
<div className="h-full w-full relative">
  <LeftSidebar />
  <NodeGraph />
  {selectedNodeId && <RightSidebar />}
</div>
```

**Requirements**:
- Wrapper should NOT have `overflow-hidden` - this can clip ReactFlow
- Sidebars should use `absolute` positioning with explicit z-index
- NodeGraph should use `absolute inset-0` to fill the container

**Correct**:
```tsx
<div className="h-full w-full relative">
  <LeftSidebar className="absolute top-4 left-4 z-20" />
  <NodeGraph className="absolute inset-0" />
</div>
```

---

## 3. MiniMap and Controls Positioning

### Use Fixed Bottom-Right Positioning

```tsx
<div
  className="absolute flex flex-col items-end gap-2 z-50"
  style={{ bottom: 16, right: 16 }}
>
  <Controls ... />
  <MiniMap ... />
</div>
```

**Why**: Using `left: 280` or other hardcoded values doesn't account for sidebar state changes.

---

## 4. Event Handler Setup

### Handle Pane Clicks

Always provide onPaneClick to deselect nodes:

```tsx
<ReactFlow
  onPaneClick={handlePaneClick}
  onPaneContextMenu={handlePaneContextMenu}
  // ...
/>
```

### Handle Node Clicks

```tsx
const handleNodeClick = useCallback((event, node) => {
  selectNode(node.id);
  setLastTouchedNode(node.id);
}, [selectNode, setLastTouchedNode]);

<ReactFlow
  onNodeClick={handleNodeClick}
  onNodeContextMenu={handleNodeContextMenu}
  // ...
/>
```

---

## 5. Animation Loop Performance

### Avoid Layout Thrashing in `requestAnimationFrame`

**Problem**: Calling `getComputedStyle()` inside an animation loop forces synchronous layout recalculation on every frame, causing severe performance degradation.

**Bad**:
```typescript
const renderMatrix = () => {
    const styleComputed = getComputedStyle(document.documentElement);
    const color = styleComputed.getPropertyValue('--my-color');
    // ... render frame
    requestAnimationFrame(renderMatrix);
};
```

**Good**:
```typescript
const colorCache = { value: '', lastUpdate: 0 };

function refreshColors() {
    const now = Date.now();
    if (now - colorCache.lastUpdate < 100) return;
    colorCache.value = getComputedStyle(document.documentElement).getPropertyValue('--my-color');
    colorCache.lastUpdate = now;
}

const renderMatrix = () => {
    refreshColors(); // Only refreshes every 100ms
    const color = colorCache.value;
    // ... render frame
    requestAnimationFrame(renderMatrix);
};
```

### Theme Change Detection

Listen for system theme changes to invalidate color caches:

```typescript
useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => { colorCache.lastUpdate = 0; };
    mediaQuery.addEventListener('change', handleThemeChange);
    return () => mediaQuery.removeEventListener('change', handleThemeChange);
}, []);
```

---

## 6. State Management

### Use Stable Selectors with Zustand

Always use shallow comparison and selective subscriptions to prevent unnecessary re-renders.

**Bad**:
```typescript
const { nodes, edges, selectedNodeId } = useNodeStore();
```

**Good**:
```typescript
const { nodes, edges } = useNodeStore(useShallow(s => ({
    nodes: s.nodes,
    edges: s.edges,
})));
const selectedNodeId = useCanvasUIStore(s => s.selectedNodeId);
```

### Avoid Delete + Add for Updates

Never delete and re-add nodes just to update a property. This causes React Flow to unmount/remount components.

**Bad**:
```typescript
useNodeStore.getState().addNode(updatedNode);
useNodeStore.getState().deleteNode(node.id);
```

**Good**:
```typescript
// Add updateNodePosition to your store
updateNodePosition: (id, position) =>
    set({
        nodes: get().nodes.map(n =>
            n.id === id ? { ...n, position } : n
        ),
    }),
```

Then use:
```typescript
useNodeStore.getState().updateNodePosition(node.id, newPosition);
```

---

## 7. Event Handler Optimization

### Use Refs for High-Frequency Events

For events that fire frequently (like drag operations), use refs to track state and avoid React re-renders.

**Bad**:
```typescript
const handleDragOver = (event) => {
    setIsDragging(true); // Triggers re-render on every event
};
```

**Good**:
```typescript
const isDraggingRef = useRef(false);
const [isDragging, setIsDragging] = useState(false);

const updateDragState = (show) => {
    if (isDraggingRef.current === show) return;
    isDraggingRef.current = show;
    setIsDragging(show);
};

const handleDragOver = (event) => {
    updateDragState(true);
};
```

---

## 8. Component Memoization

### Memoize Expensive Computations

Use `useMemo` for expensive computations that don't need to run on every render.

```typescript
const wrappedNodeTypes = useMemo(
    () => buildWrappedNodeTypes(handleDeleteRequest),
    [handleDeleteRequest]
);
```

### Avoid Creating New Objects in Render

Create objects outside the render method or memoize them:

```typescript
// Bad: New object every render
const config = { theme: 'dark', zoom: 1 };

// Good: Define outside component or useMemo
const CONFIG = { theme: 'dark', zoom: 1 };
```

---

## 9. React Flow Specific Optimizations

### Stable Node Types Reference

Pass a memoized `nodeTypes` object to ReactFlow:

```typescript
const nodeTypes = useMemo(() => ({
    scene: SceneNode,
    character: CharacterNode,
    // ...
}), []);
```

### Optimize Edge Rendering

For large graphs, consider filtering edges outside of React's render cycle:

```typescript
const visibleEdges = useMemo(() => {
    if (!selectedNodeId) return edges;
    return edges.filter(e => 
        e.source === selectedNodeId || e.target === selectedNodeId
    );
}, [edges, selectedNodeId]);
```

### Use Viewport Subscriptions Carefully

The viewport changes frequently. Only subscribe when needed:

```typescript
const transform = useStore(state => state.transform);
// NOT: useStore(state => state)  // Re-renders on every change
```

---

## 10. Performance Monitoring

### Use React DevTools Profiler

Monitor component re-renders and identify:
- Components that re-render too often
- Expensive computations in render
- Unnecessary state updates

### Measure with Performance API

```typescript
const measure = (name, fn) => {
    performance.mark(`${name}-start`);
    const result = fn();
    performance.mark(`${name}-end`);
    performance.measure(name, `${name}-start`, `${name}-end`);
    return result;
};
```

---

## 11. Common Pitfalls

| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing `@xyflow/react/dist/style.css` | Click events don't work, no MiniMap/Controls | Add import at top of canvas component file |
| No explicit width/height | ReactFlow doesn't fill container | Add `style={{ width: '100%', height: '100%' }}` |
| Missing Background component | Grid renders on top of nodes | Add `<Background />` inside ReactFlow |
| `getComputedStyle` in loop | 30fps or lower | Cache colors outside loop |
| Delete + add for updates | Nodes flash/disappear | Use proper update method |
| No shallow comparison | Whole canvas re-renders | Use `useShallow` |
| New object in render | Infinite re-renders | Memoize or define outside |
| Unbounded subscriptions | Store updates cascade | Subscribe to specific slices |
| Wrapper has `overflow-hidden` | Canvas clipped | Remove overflow from wrapper |

---

## Summary

**Required for every canvas component:**
1. **Import React Flow styles** - `import '@xyflow/react/dist/style.css';`
2. **Set explicit dimensions** - `style={{ width: '100%', height: '100%', pointerEvents: 'auto' }}`
3. **Add Background component** - `<Background gap={30} size={1} color="var(--border)" />`
4. **Add fitView prop** - for proper initial viewport

**For performance:**
1. **Cache expensive operations** - Especially in animation loops
2. **Use refs for transient state** - Drag, hover, and similar events
3. **Select only what you need** - Zustand shallow subscriptions
4. **Memoize expensive computations** - `useMemo` and `useCallback`
5. **Avoid object creation in render** - Define constants outside components
6. **Test at scale** - Verify performance with realistic node/edge counts (100+)

Following these practices ensures smooth 60fps interactions even with complex graphs and animations.
