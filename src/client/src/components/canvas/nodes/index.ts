// src/client/src/components/canvas/nodes/index.ts
// Maps CanvasNodeType keys to the actual React Flow component implementations.
// This object is passed directly to the <ReactFlow nodeTypes={nodeTypes} /> provider.

import type { NodeTypes } from '@xyflow/react';
import { MetadataNode } from './MetadataNode.js';
import { CharacterNode } from './CharacterNode.js';
import { LocationNode } from './LocationNode.js';
import { SceneNode } from './SceneNode.js';
import { ImageNode } from './ImageNode.js';
import { CompositeNode } from './CompositeNode.js';
import { AudioNode } from './AudioNode.js';
import { RenderNode } from './RenderNode.js';

export const nodeTypes: NodeTypes = {
  metadata: MetadataNode,
  character: CharacterNode,
  location: LocationNode,
  scene: SceneNode,
  image: ImageNode,
  composite: CompositeNode,
  audio: AudioNode,
  render: RenderNode,
};
