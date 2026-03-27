// src/client/src/domain/canvas/CoordinateSystem.ts
// Viewport coordinate transformation utilities.
//
// WHY THIS EXISTS:
//   React Flow operates in "world space" (canvas coordinates). Browser drag/drop
//   events fire in "screen space" (window pixel coordinates). Without transforming,
//   a dropped node spawns at the wrong position — the infamous "teleporting node" bug.
//
// USAGE:
//   const onDrop = (event: DragEvent) => {
//     const { viewport } = useNodeStore.getState();
//     const worldPos = screenToWorld(event.clientX, event.clientY, viewport);
//     NodeFactory.createNode({ ..., posCanvas: worldPos });
//   };

export interface ViewportTransform {
  x: number;     // Canvas pan offset in screen pixels (positive = panned right)
  y: number;     // Canvas pan offset in screen pixels (positive = panned down)
  zoom: number;  // Canvas zoom level (1.0 = 100%, 2.0 = 200%, etc.)
}

/**
 * Converts browser screen coordinates to React Flow world (canvas) coordinates.
 *
 * Formula:
 *   worldX = (screenX - viewportPanX) / zoomLevel
 *   worldY = (screenY - viewportPanY) / zoomLevel
 *
 * This is the inverse of the React Flow viewport transform, which maps world → screen:
 *   screenX = worldX * zoom + panX
 *
 * @param screenX - clientX from the drag/drop event
 * @param screenY - clientY from the drag/drop event
 * @param transform - current viewport pan and zoom from useNodeStore
 * @returns World-space coordinates for the node position
 */
export const screenToWorld = (
  screenX: number,
  screenY: number,
  transform: ViewportTransform
): { x: number; y: number } => ({
  x: (screenX - transform.x) / transform.zoom,
  y: (screenY - transform.y) / transform.zoom,
});

// Grid size for snapping (coarser grid for better node positioning)
export const GRID_SIZE = 30;

/**
 * Snaps a position to the nearest grid point.
 * @param position - The x, y coordinates to snap
 * @param gridSize - The grid size (defaults to GRID_SIZE = 24)
 * @returns Snapped position
 */
export const snapToGrid = (
  position: { x: number; y: number },
  gridSize: number = GRID_SIZE
): { x: number; y: number } => ({
  x: Math.max(0, Math.round(position.x / gridSize) * gridSize),
  y: Math.max(0, Math.round(position.y / gridSize) * gridSize),
});

// Default node dimensions for auto-layout calculations
// Character/Location/Scene nodes are approximately 215px wide, 240px tall
export const DEFAULT_NODE_WIDTH = 215;
export const DEFAULT_NODE_HEIGHT = 240;

/**
 * Calculates the next position for a new node based on auto-layout rules.
 * Places new nodes in a wrapping sequence:
 * - First node drops at drop cursor position (or origin if no cursor position provided)
 * - Subsequent nodes: full node width to the right of the right-most node
 * - If the next position would be outside the viewport, wrap to a new row below the left-most node
 * 
 * @param nodes - Existing canvas nodes
 * @param newNodeType - Type of the new node being created
 * @param dropPosition - Optional drop cursor position (world coordinates)
 * @param viewport - Current viewport transform for bounds checking
 * @param gridSize - Grid size for snapping (defaults to GRID_SIZE = 30)
 * @returns Calculated position for the new node
 */
export const calculateAutoLayoutPosition = (
  nodes: Array<{ type?: string; position: { x: number; y: number } }>,
  newNodeType: string,
  dropPositionOrGridSize?: { x: number; y: number } | number,
  viewportOrUndefined?: ViewportTransform,
  gridSize: number = GRID_SIZE
): { x: number; y: number } => {
  let dropPosition: { x: number; y: number } | undefined;
  let viewport: ViewportTransform | undefined;
  
  if (typeof dropPositionOrGridSize === 'number') {
    gridSize = dropPositionOrGridSize;
  } else {
    dropPosition = dropPositionOrGridSize;
    viewport = viewportOrUndefined;
  }
  
  const sameTypeNodes = nodes.filter(n => n.type === newNodeType);
  
  if (sameTypeNodes.length === 0) {
    if (dropPosition) {
      return { x: dropPosition.x, y: dropPosition.y };
    }
    return { x: 0, y: 0 };
  }
  
  const rightMostNode = sameTypeNodes.reduce((prev, curr) =>
    curr.position.x > prev.position.x ? curr : prev
  );
  
  const nextX = rightMostNode.position.x + DEFAULT_NODE_WIDTH + 80;
  const nextY = rightMostNode.position.y;
  
  let needsWrap = false;
  if (viewport && typeof window !== 'undefined') {
    const RIGHT_SIDEBAR_WIDTH = 300;
    const rightEdge = (window.innerWidth - RIGHT_SIDEBAR_WIDTH - viewport.x) / viewport.zoom;
    
    if (nextX + DEFAULT_NODE_WIDTH > rightEdge) {
      needsWrap = true;
    }
  }
  
  let finalPos: { x: number; y: number };
  
  if (needsWrap) {
    const leftMostNode = sameTypeNodes.reduce((prev, curr) =>
      curr.position.x < prev.position.x ? curr : prev
    );
    const bottomMostNode = sameTypeNodes.reduce((prev, curr) =>
      curr.position.y > prev.position.y ? curr : prev
    );
    finalPos = {
      x: leftMostNode.position.x,
      y: bottomMostNode.position.y + DEFAULT_NODE_HEIGHT + 50,
    };
  } else {
    finalPos = { x: nextX, y: nextY };
  }
  
  return finalPos;
};
