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
      case 'scene':     return <SceneInspector node={selectedNode} />;
      case 'character': return <CharacterInspector node={selectedNode} />;
      case 'location':  return <LocationInspector node={selectedNode} />;
      case 'image':     return <ImageInspector node={selectedNode} />;
      case 'composite': return <CompositeInspector node={selectedNode} />;
      default:          return <div className="p-4 text-gray-500">No inspector available for this node type.</div>;
    }
  };

  return (
    <div className="absolute top-16 right-4 bottom-4 w-96 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden z-20 animate-in slide-in-from-right-4 duration-200">
      
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="font-bold text-xs text-gray-400 tracking-wider uppercase">Inspector</span>
          <span className="text-sm font-medium text-gray-200 capitalize">{selectedNode.type} Node</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-white hover:bg-red-900/20">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Dynamic Inspector Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {renderInspector()}
      </div>
    </div>
  );
}
