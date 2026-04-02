import React, { useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
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

export function RightSidebar() {
  const { selectedNodeId, selectNode, openDeleteDialog } = useCanvasUIStore();
  const { nodes } = useNodeStore();

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  useEffect(() => {
    if (selectedNodeId && !selectedNode) {
      selectNode(null);
    }
  }, [selectedNodeId, selectedNode, selectNode]);

  const handleClose = () => {
    selectNode(null);
  };

  const handleDeleteClick = () => {
    if (selectedNode) {
      openDeleteDialog(selectedNode.id);
    }
  };

  if (!selectedNode) return null;

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
    <div className="h-full w-full flex flex-col bg-background relative z-20">
      <div className="absolute top-0 right-0 px-4 py-3 flex gap-2 z-10">
        {selectedNode.type !== 'metadata' && <Button variant="destructive" size="icon" onClick={handleDeleteClick} className="text-gray-500 hover:text-white hover:bg-red-900/20">
          <Trash2 className="w-5 h-5" />
        </Button>}
        <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-white hover:bg-red-900/20">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto pt-12">
        {renderInspector()}
      </div>
    </div>
  );
}
