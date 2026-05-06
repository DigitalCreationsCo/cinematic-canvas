import { CanvasEdge, CanvasNode } from "#client/domain/canvas/NodeTypes.js";
import { generateId } from "#shared/utils/id.js";

export const createMockNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: generateId(),
  type: "character",
  position: { x: 0, y: 0 },
  data: {
    entityId: generateId(),
    contextId: "test-context",
    contextType: "project",
    scope: "project",
    isLocked: false,
    pipelineSelected: true,
    collapsed: false,
    idxVersion: 1,
    ...overrides,
  },
  ...overrides,
});

export const createMockEdge = (id: string, source: string, target: string): CanvasEdge => ({
  id,
  source,
  target,
  type: "scene_sequence",
});
