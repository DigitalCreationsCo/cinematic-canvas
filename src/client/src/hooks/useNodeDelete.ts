import { useCallback, useState, useEffect, useRef } from 'react';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';

const MIN_ZOOM_FOR_OVERLAY = 0.3;

export function useNodeDelete(zoom: number) {
  const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);
  const nodes = useNodeStore((s) => s.nodes);
  const softDeletedNodes = useNodeStore((s) => s.softDeletedNodes);
  const edges = useNodeStore((s) => s.edges);

  const [pendingDeleteNode, setPendingDeleteNode] = useState<CanvasNode | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
  const isNodeSoftDeleted = selectedNodeId ? softDeletedNodes.includes(selectedNodeId) : false;

  const hasEdges = selectedNodeId
    ? edges.some(e => e.source === selectedNodeId || e.target === selectedNodeId)
    : false;

  const showOverlay = selectedNode && !isNodeSoftDeleted && zoom >= MIN_ZOOM_FOR_OVERLAY;

  const requestDelete = useCallback((node: CanvasNode) => {
    setPendingDeleteNode(node);
    const hasConnectedEdges = edges.some(e => e.source === node.id || e.target === node.id);
    if (hasConnectedEdges) {
      setShowConfirmDialog(true);
    } else {
      useNodeStore.getState().deleteNode(node.id, true);
      useCanvasUIStore.getState().selectNode(null);
    }
  }, [edges]);

  const confirmDelete = useCallback(() => {
    if (pendingDeleteNode) {
      useNodeStore.getState().deleteNode(pendingDeleteNode.id, true);
      setPendingDeleteNode(null);
      setShowConfirmDialog(false);
      useCanvasUIStore.getState().selectNode(null);
    }
  }, [pendingDeleteNode]);

  const cancelDelete = useCallback(() => {
    setPendingDeleteNode(null);
    setShowConfirmDialog(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedNodeId) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

        const node = nodes.find(n => n.id === selectedNodeId);
        if (node) {
          e.preventDefault();
          requestDelete(node);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, nodes, requestDelete]);

  return {
    selectedNode,
    isNodeSoftDeleted,
    hasEdges,
    showOverlay,
    showConfirmDialog,
    pendingDeleteNode,
    requestDelete,
    confirmDelete,
    cancelDelete,
    setShowConfirmDialog,
  };
}
