# Canvas Performance Best Practices

This guide outlines performance best practices for developing canvas-related features in the Cinematic Canvas application, specifically focusing on React Flow DAG canvases and HTML5 Canvas animations.

## Overview

The canvas system consists of two main components:
1. **React Flow DAG Canvas** - Interactive node-based editor for managing projects and worlds
2. **HTML5 Canvas Background** - Animated visual effects (EllipsoidMatrix)

Both components require careful attention to performance to maintain smooth 60fps interactions.

---

## 1. Animation Loop Performance

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

## 2. State Management

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

## 3. Event Handler Optimization

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

## 4. Component Memoization

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

## 5. React Flow Specific Optimizations

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

## 6. Performance Monitoring

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

## 7. Common Pitfalls

| Issue | Symptom | Solution |
|-------|---------|----------|
| `getComputedStyle` in loop | 30fps or lower | Cache colors outside loop |
| Delete + add for updates | Nodes flash/disappear | Use proper update method |
| No shallow comparison | Whole canvas re-renders | Use `useShallow` |
| New object in render | Infinite re-renders | Memoize or define outside |
| Unbounded subscriptions | Store updates cascade | Subscribe to specific slices |

---

## Summary

1. **Cache expensive operations** - Especially in animation loops
2. **Use refs for transient state** - Drag, hover, and similar events
3. **Select only what you need** - Zustand shallow subscriptions
4. **Memoize expensive computations** - `useMemo` and `useCallback`
5. **Avoid object creation in render** - Define constants outside components
6. **Test at scale** - Verify performance with realistic node/edge counts (100+)

Following these practices ensures smooth 60fps interactions even with complex graphs and animations.
