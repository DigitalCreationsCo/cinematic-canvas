import { useEffect } from 'react';
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
import { cn } from '../../../lib/utils.js';

interface RightSidebarProps {
  className?: string;
}

export function RightSidebar({ className }: RightSidebarProps) {
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
    <div
      className={cn("absolute top-4 bottom-4 card-cinematic-glass flex flex-col bg-background z-20", className)}
    >
      <div className="pl-4 h-full w-full flex flex-col relative">
        <div className="absolute top-0 right-0 px-4 py-3 flex gap-2 z-10">
          {selectedNode.type !== 'metadata' && <Button variant="destructive" size="icon" onClick={handleDeleteClick} className="text-gray-500 hover:text-white hover:bg-red-900/20">
            <Trash2 className="w-5 h-5" />
          </Button>}
          <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-white hover:bg-red-900/20">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="overflow-y-scroll ">
          {renderInspector()}
        </div>
      </div>
    </div>
  );
}
