// src/client/src/domain/canvas/NodeFactory.ts
// Single mandatory entry point for ALL node/edge creation.
//
// RULE: No node or edge object may be constructed inline anywhere else.

import type {
  CanvasNode,
  CanvasEdge,
  CanvasNodeType,
  CanvasNodeData,
  CanvasEdgeData,
  ImageNodeFlag,
  EdgeType,
} from './NodeTypes.js';
import { EDGE_STYLES, PENDING_EDGE_STYLE } from './NodeTypes.js';

export class NodeFactory {

  /**
   * Creates a canvas node.
   * node.id === entityId for O(1) ReactFlow lookup.
   */
  static createNode = (params: {
    type: CanvasNodeType;
    entityId: string;
    contextId: string;
    contextType: 'project' | 'world';
    posCanvas: { x: number; y: number };
    scope: 'world' | 'project';
    nodeTypeFlag?: ImageNodeFlag;
    pipelineSelected?: boolean;
    isLocked?: boolean;
    width?: number;
    height?: number;
    idxVersion?: number;
  }): CanvasNode => ({
    id: params.entityId,
    type: params.type,
    position: params.posCanvas,
    width: params.width,
    height: params.height,
    data: {
      entityId: params.entityId,
      contextId: params.contextId,
      contextType: params.contextType,
      nodeTypeFlag: params.nodeTypeFlag,
      scope: params.scope,
      isLocked: params.isLocked ?? false,
      pipelineSelected: params.pipelineSelected ?? true,
      collapsed: false,
      idxVersion: params.idxVersion ?? 1,
      pendingChangeCount: 0,
    } satisfies CanvasNodeData,
  });

  /**
   * Creates a canvas edge.
   *
   * Edge ID: `${sourceId}__${type}__${targetId}` — deterministic and human-readable.
   *
   * @param pending  When true, edge is styled amber-dashed (unsaved pending-add).
   */
  static createEdge = (params: {
    sourceId: string;
    targetId: string;
    type: EdgeType;
    sourceHandle?: string;
    targetHandle?: string;
    animated?: boolean;
    pending?: boolean;
  }): CanvasEdge => {
    const isPending = params.pending ?? false;

    const data: CanvasEdgeData = isPending
      ? { pending: true, pendingType: 'add' }
      : {};

    return {
      id: this.getEdgeId(params.sourceId, params.targetId, params.type),
      source: params.sourceId,
      target: params.targetId,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
      type: params.type,
      animated: params.animated ?? true,
      style: isPending ? PENDING_EDGE_STYLE : EDGE_STYLES[params.type],
      data,
    };
  };

  /**
   * Promotes a pending-add edge to a live committed edge.
   * Called after a successful Save response from the backend.
   */
  static promoteEdge = (edge: CanvasEdge): CanvasEdge => ({
    ...edge,
    style: EDGE_STYLES[edge.type ?? 'scene_sequence'],
    data: { ...edge.data, pending: false, pendingType: undefined },
  });

  static getEdgeId = (
    sourceId: string,
    targetId: string,
    type: EdgeType,
  ): string => `${sourceId}__${type}__${targetId}`;
}