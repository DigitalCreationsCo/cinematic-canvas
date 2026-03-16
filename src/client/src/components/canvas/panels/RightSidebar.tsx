import React from 'react';
import { X } from 'lucide-react';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { Button } from '../../ui/button.js';
import {
  SceneInspector,
  CharacterInspector,
  LocationInspector,
  ImageInspector,
  CompositeInspector
} from '../inspection/index.js';

export function RightSidebar() {
  const { rightSidebarOpen, selectedNodeId, selectNode } = useCanvasUIStore();
  const { nodes } = useNodeStore();

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  // Auto-close handler (can also be mapped to Escape key in a higher component)
  const handleClose = () => {
    selectNode(null);
  };

  if (!rightSidebarOpen || !selectedNode) return null;

  const renderInspector = () => {
    switch (selectedNode.type) {
      case 'scene': return <SceneInspector node={selectedNode} />;
      case 'character': return <CharacterInspector node={selectedNode} />;
      case 'location': return <LocationInspector node={selectedNode} />;
      case 'image': return <ImageInspector node={selectedNode} />;
      case 'composite': return <CompositeInspector node={selectedNode} />;
      default: return <div className="p-4 text-gray-500">No inspector available for this node type.</div>;
    }
  };

  return (
    <div className="flex flex-col relative h-full w-full backdrop-blur-xl shadow-2xl flex flex-col z-20 animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="absolute top-0 right-0 px-4 py-3">
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-white hover:bg-red-900/20">
          <X className="w-5 h-5" />
        </Button>
      </div>
      {/* Dynamic Inspector Content */}
      {renderInspector()}
    </div>
  );
}
