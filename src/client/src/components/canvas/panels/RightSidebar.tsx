import { useEffect, useCallback, useRef } from 'react';
import { X, Trash2 } from 'lucide-react';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { Button } from '#client/components/ui/button.js';
import {
  SceneInspector,
  CharacterInspector,
  LocationInspector,
  ImageInspector,
  CompositeInspector,
  MetadataNodeInspector
} from '#client/components/canvas/inspection/index.js';
import { cn } from '#client/lib/utils.js';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '#client/components/ui/resizable.js';
import { BASE_OFFSET, SIDEBAR_GAP, useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { selectAuxiliarySidebarWidth, useUIMenuStore } from '#client/store/useUIMenuStore.js';

interface RightSidebarProps {
  className?: string;
}

export function RightSidebar({ className }: RightSidebarProps) {
  const selectedNodeId = useCanvasUIStore(s => s.selectedNodeId);
  const selectNode = useCanvasUIStore(s => s.selectNode);
  const openDeleteDialog = useCanvasUIStore(s => s.openDeleteDialog);
  const auxiliarySidebarWidth = useUIMenuStore(selectAuxiliarySidebarWidth);

  const { nodes } = useNodeStore();

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  const rightPanelOffset = BASE_OFFSET + (auxiliarySidebarWidth > 0 ? auxiliarySidebarWidth + SIDEBAR_GAP : 0);

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

    <ResizablePanelGroup
      direction="horizontal"
      className="overflow-hidden absolute transition-[right] top-4 bottom-4 max-h-[96%] duration-200 ease-out"
      style={{ right: rightPanelOffset }}
    >
      <ResizablePanel defaultSize={80} />

      <ResizableHandle className="" />
      <ResizablePanel defaultSize={25} minSize={25} maxSize={65} className="z-20 card-cinematic-glass border-border dark:border-l-primary/40 hover:border-l-primary/50 border-l-4 active:border-l-primary/50">
        <div
          className={cn(
            // "absolute w-full top-0 bottom-0 right-0 my-4 card-cinematic-glass flex flex-col bg-background z-20",
            "h-full w-full flex flex-col ",
            className
          )}
        >
          <div className="h-full w-full flex flex-col relative">

            <div className="absolute top-0 right-0 px-4 py-8 flex gap-2 z-10">
              {selectedNode.type !== 'metadata' &&
                <Button variant="destructive" size="icon" onClick={handleDeleteClick} className="text-gray-500 hover:text-white hover:bg-red-900/20">
                  <Trash2 className="w-5 h-5" />
                </Button>
              }
              <Button variant="ghost" size="icon" onClick={handleClose} className="text-gray-500 hover:text-white hover:bg-red-900/20">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="overflow-y-auto py-4 h-full">
              {renderInspector()}
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>

  );
}
