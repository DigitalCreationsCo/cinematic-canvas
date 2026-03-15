// src/client/src/domain/canvas/NodeFactory.ts
// Single mandatory entry point for ALL node creation in the entire application.
//
// RULE: No node object may be constructed inline in any React component.
//   User drag, agent PubSub event, legacy migration, and programmatic creation
//   all call NodeFactory.createNode() or NodeFactory.createEdge().
//
// WHY: Centralizing creation ensures idxVersion defaults, data shape consistency,
//   and edge ID format are uniform across all creation paths.

import { v7 as uuidv7 } from 'uuid';
import type { CanvasNode, CanvasEdge, CanvasNodeType, CanvasNodeData, ImageNodeFlag, EdgeType } from './NodeTypes.js';
import { EDGE_STYLES } from './NodeTypes.js';

export class NodeFactory {

  /**
   * Creates a canvas node.
   *
   * KEY DECISION: node.id === entityId for O(1) lookup.
   * React Flow uses node.id as the primary key; by making it the entityId,
   * we avoid a separate lookup map entirely.
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
    id: params.entityId,   // node.id === entityId for O(1) lookup
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
    } satisfies CanvasNodeData,
  });

  /**
   * Creates a canvas edge.
   *
   * Edge ID format: `${sourceId}__${type}__${targetId}`
   * This is deterministic and human-readable in DevTools.
   */
  static createEdge = (params: {
    sourceId: string;
    targetId: string;
    type: EdgeType;
    animated?: boolean;
  }): CanvasEdge => ({
    id: this.getEdgeId(params.sourceId, params.targetId, params.type),
    source: params.sourceId,
    target: params.targetId,
    type: params.type,
    animated: params.animated ?? false,
    style: EDGE_STYLES[params.type],
  });

  static getEdgeId = (sourceId: string, targetId: string, type: EdgeType) => `${sourceId}__${type}__${targetId}`;

};
