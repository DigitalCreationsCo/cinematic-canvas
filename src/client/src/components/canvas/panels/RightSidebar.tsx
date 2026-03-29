import React, { useEffect, useState, useCallback } from 'react';
import { X, Trash2, GripVertical } from 'lucide-react';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { Button } from '../../ui/button.js';
import {
  SceneInspector,
  CharacterInspector,
  LocationInspector,
  ImageInspector,
  CompositeInspector,
  MetadataNodeInspector
} from '../inspection/index.js';
import { cn } from '../../../lib/utils.js';

const MIN_WIDTH = 280;
const MAX_WIDTH = 500;
const DEFAULT_WIDTH = 360;
const MESSAGES_SIDEBAR_WIDTH = 320;

export function RightSidebar() {
  const { rightSidebarOpen, selectedNodeId, selectNode, openDeleteDialog, messagesSidebarOpen } = useCanvasUIStore();
  const { nodes } = useNodeStore();

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (selectedNodeId && !selectedNode && rightSidebarOpen) {
      selectNode(null);
    }
  }, [selectedNodeId, selectedNode, rightSidebarOpen, selectNode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleClose = () => {
    selectNode(null);
  };

  const handleDeleteClick = () => {
    if (selectedNode) {
      openDeleteDialog(selectedNode.id);
    }
  };

  if (!rightSidebarOpen || !selectedNode) return null;

  const rightOffset = messagesSidebarOpen ? MESSAGES_SIDEBAR_WIDTH + 16 : 16;

  const renderInspector = () => {
    switch (selectedNode.type) {
      case 'scene': return <SceneInspector node={selectedNode} />;
      case 'character': return <CharacterInspector node={selectedNode} />;
      case 'location': return <LocationInspector node={selectedNode} />;
      case 'image': return <ImageInspector node={selectedNode} />;
      case 'composite': return <CompositeInspector node={selectedNode} />;
      case 'metadata': return <MetadataNodeInspector node={selectedNode} />;
      default: return <div className="p-4 text-gray-500">No inspector available for this node type.</div>;
    }
  };

  return (
    <div
      className={cn(
        "absolute top-4 bottom-4 flex flex-col backdrop-blur-xl shadow-2xl z-20",
        "bg-panel/95 border border-panel-border rounded-lg overflow-hidden",
        isResizing ? "transition-none" : "transition-all duration-200 ease-out"
      )}
      style={{ 
        width,
        right: rightOffset,
      }}
    >
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize flex items-center justify-center z-50",
          "bg-transparent hover:bg-primary/30 transition-colors",
          isResizing && "bg-primary/50"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className={cn(
          "absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2",
          "flex flex-col gap-1 py-4 px-0.5 rounded-md",
          "bg-muted/80 hover:bg-primary/20 border border-border/50",
          "transition-all duration-200",
          "opacity-100"
        )}>
          <GripVertical className={cn(
            "w-3 h-3 transition-colors",
            isResizing ? "text-primary" : "text-muted-foreground/70 hover:text-foreground"
          )} />
          <GripVertical className={cn(
            "w-3 h-3 transition-colors",
            isResizing ? "text-primary" : "text-muted-foreground/70 hover:text-foreground"
          )} />
          <GripVertical className={cn(
            "w-3 h-3 transition-colors",
            isResizing ? "text-primary" : "text-muted-foreground/70 hover:text-foreground"
          )} />
        </div>
      </div>

      <div className="absolute top-0 right-0 px-4 py-3 flex gap-2 z-10">
        <Button variant="ghost" size="icon" onClick={handleDeleteClick} className="text-gray-500 hover:text-white hover:bg-red-900/20">
          <Trash2 className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-white hover:bg-red-900/20">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto pt-12 pl-2">
        {renderInspector()}
      </div>
    </div>
  );
}
