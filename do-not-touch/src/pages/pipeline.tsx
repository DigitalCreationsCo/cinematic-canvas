import React, { useState, useCallback } from "react";
import { TopNav } from "@/components/pipeline/TopNav";
import { WorldAssetPanel } from "@/components/pipeline/WorldAssetPanel";
import { PropertiesPanel } from "@/components/pipeline/PropertiesPanel";
import { NodeGraph } from "@/components/pipeline/NodeGraph";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";

export default function PipelinePage() {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null);
    // Handle drop logic here (e.g., adding asset to a scene)
    console.log("Dropped", event.active.id, "over", event.over?.id);
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
        <TopNav />
        
        <div className="flex-1 h-full overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Sidebar: World Assets */}
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-panel border-r border-panel-border">
              <WorldAssetPanel />
            </ResizablePanel>
            
            <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors" />
            
            {/* Main Center: Node Graph Canvas */}
            <ResizablePanel defaultSize={60}>
              <div className="h-full w-full relative">
                 <NodeGraph />
              </div>
            </ResizablePanel>
            
            <ResizableHandle className="w-1 bg-border hover:bg-primary transition-colors" />
            
            {/* Right Sidebar: Properties/Inspector */}
            <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-panel border-l border-panel-border">
              <PropertiesPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
      
      {/* Drag Overlay for visual feedback when dragging assets */}
      <DragOverlay>
        {activeDragId ? (
          <div className="bg-card border border-primary rounded-md p-2 shadow-lg opacity-80 text-xs flex items-center gap-2">
            <div className="w-6 h-6 bg-muted rounded" />
            <span>Dragging {activeDragId}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}