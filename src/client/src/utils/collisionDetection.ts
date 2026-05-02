// src/client/src/utils/collisionDetection.ts
// Collision detection and resolution for React Flow nodes.
// Detects overlapping nodes after drag operations and resolves collisions
// by pushing nodes apart along the smallest overlap axis.

import type { Node } from "@xyflow/react";
import type { CanvasNode } from "../domain/canvas/NodeTypes.js";

export type CollisionAlgorithmOptions = {
  maxIterations: number;
  overlapThreshold: number;
  margin: number;
};

export type CollisionAlgorithm = (
  nodes: Node[],
  options: CollisionAlgorithmOptions,
) => Node[];

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  moved: boolean;
  node: Node;
};

/**
 * Convert nodes to bounding boxes for collision calculations.
 * Uses node.position, node.width, node.height, and falls back to node.measured.
 */
function getBoxesFromNodes(nodes: Node[], margin = 0): Box[] {
  const boxes: Box[] = new Array(nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    boxes[i] = {
      x: node.position.x - margin,
      y: node.position.y - margin,
      width: (node.width ?? node.measured?.width ?? 0) + margin * 2,
      height: (node.height ?? node.measured?.height ?? 0) + margin * 2,
      node,
      moved: false,
    };
  }

  return boxes;
}

/**
 * Detects and resolves node collisions using an iterative push-apart algorithm.
 *
 * For each pair of overlapping nodes, calculates overlap on both axes and
 * moves them apart along the axis with the smallest overlap (most constrained).
 * Runs for up to maxIterations or until no overlaps remain.
 *
 * @param nodes - Array of React Flow nodes to check for collisions
 * @param options - Configuration options for the algorithm
 * @returns New array of nodes with updated positions where collisions were resolved
 */
export const resolveCollisions: CollisionAlgorithm = (
  nodes,
  { maxIterations = 50, overlapThreshold = 0.5, margin = 0 },
) => {
  const boxes = getBoxesFromNodes(nodes, margin);

  for (let iter = 0; iter <= maxIterations; iter++) {
    let moved = false;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i];
        const B = boxes[j];

        // Calculate center positions
        const centerAX = A.x + A.width * 0.5;
        const centerAY = A.y + A.height * 0.5;
        const centerBX = B.x + B.width * 0.5;
        const centerBY = B.y + B.height * 0.5;

        // Calculate distance between centers
        const dx = centerAX - centerBX;
        const dy = centerAY - centerBY;

        // Calculate overlap along each axis
        const px = (A.width + B.width) * 0.5 - Math.abs(dx);
        const py = (A.height + B.height) * 0.5 - Math.abs(dy);

        // Check if there's significant overlap
        if (px > overlapThreshold && py > overlapThreshold) {
          A.moved = B.moved = moved = true;
          // Resolve along the smallest overlap axis
          if (px < py) {
            // Move along x-axis
            const sx = dx > 0 ? 1 : -1;
            const moveAmount = (px / 2) * sx;
            A.x += moveAmount;
            B.x -= moveAmount;
          } else {
            // Move along y-axis
            const sy = dy > 0 ? 1 : -1;
            const moveAmount = (py / 2) * sy;
            A.y += moveAmount;
            B.y -= moveAmount;
          }
        }
      }
    }
    // Early exit if no overlaps were found
    if (!moved) {
      break;
    }
  }

  const newNodes = boxes.map((box) => {
    if (box.moved) {
      return {
        ...box.node,
        position: {
          x: box.x + margin,
          y: box.y + margin,
        },
      };
    }
    return box.node;
  });

  return newNodes;
};

/**
 * Convenience wrapper for canvas usage.
 * Takes CanvasNode[], resolves collisions, and returns updated nodes.
 */
export function resolveCanvasNodeCollisions(
  nodes: CanvasNode[],
  options: CollisionAlgorithmOptions = {
    maxIterations: 50,
    overlapThreshold: 0.5,
    margin: 10,
  },
): CanvasNode[] {
  return resolveCollisions(nodes, options) as CanvasNode[];
}
