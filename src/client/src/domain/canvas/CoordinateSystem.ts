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

/**
 * Calculates the next position for a new node based on auto-layout rules.
 * Places the new node to the right of the bottom-most node of the same type.
 * 
 * @param nodes - Existing canvas nodes
 * @param newNodeType - Type of the new node being created
 * @param gridSize - Grid size for snapping (defaults to GRID_SIZE = 24)
 * @returns Calculated position for the new node
 */
export const calculateAutoLayoutPosition = (
  nodes: Array<{ type?: string; position: { x: number; y: number } }>,
  newNodeType: string,
  gridSize: number = GRID_SIZE
): { x: number; y: number } => {
  const sameTypeNodes = nodes.filter(n => n.type === newNodeType);

  if (sameTypeNodes.length === 0) {
    return snapToGrid({ x: 0, y: 0 }, gridSize);
  }

  const bottomMostNode = sameTypeNodes.reduce((prev, curr) =>
    curr.position.y > prev.position.y ? curr : prev
  );

  const newX = bottomMostNode.position.x + (gridSize * 4);
  const newY = bottomMostNode.position.y;

  return snapToGrid({ x: newX, y: newY }, gridSize);
};
