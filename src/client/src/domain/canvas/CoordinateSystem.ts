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
