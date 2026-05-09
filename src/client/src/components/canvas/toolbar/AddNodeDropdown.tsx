import React, { useCallback, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "#client/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from "#client/components/ui/dropdown-menu.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import type { CanvasNodeType } from "#shared/types/canvas.types.js";
import { EntityCreatableType } from "#shared/types/entity.types.js";
import { calculateAutoLayoutPosition } from "#client/domain/canvas/CoordinateSystem.js";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#client/components/ui/tooltip.js";
import { cn } from "#client/lib/utils.js";
import { NodeCreationMenu } from "#client/components/canvas/context-menu/CanvasContextMenu.js";
import { NewEntityModal } from "#client/components/canvas/panels/NewEntityModal.js";
import { EventStopper } from "#client/components/ui/event-stopper.js";

export interface AddNodeDropdownProps {
  contextType: "project" | "world";
  projectId?: string;
  worldId?: string;
  wrapperRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

export function AddNodeDropdown({
  contextType,
  projectId,
  worldId,
  wrapperRef,
  className,
}: AddNodeDropdownProps) {
  const { nodes } = useNodeStore();
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);
  const isDropdownOpen = useUIMenuStore((s) => s.isDropdownOpen);
  const setDropdownOpen = useUIMenuStore((s) => s.setDropdownOpen);
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  // ── Modal state (rendered outside the dropdown so it survives close) ─────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntityType, setModalEntityType] = useState<EntityCreatableType>("character");
  const modalProjectId = projectId || selectedProjectId || "";

  const handleOpenModal = useCallback(
    (type: EntityCreatableType) => {
      setModalEntityType(type);
      setModalOpen(true);
      setDropdownOpen(false); // Close the dropdown – modal is rendered at a higher level
    },
    [],
  );

  const getPosition = useCallback(
    (type: CanvasNodeType) => {
      if (autoLayout) {
        return calculateAutoLayoutPosition(nodes, type);
      }
      return {
        x: 400 + Math.random() * 200,
        y: 300 + Math.random() * 200,
      };
    },
    [autoLayout, nodes],
  );

  return (
    <>
      <Tooltip>
        <DropdownMenu open={isDropdownOpen} onOpenChange={(open) => setDropdownOpen(open)}>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(`gap-2 pl-5 pr-6 `, className)}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Node</span>
              </Button>
            </TooltipTrigger>
          </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 border p-0">
              <div className="p-2 font-medium text-[10px] text-muted-foreground/50 font-mono">
                Add Node
              </div>
              <DropdownMenuSeparator />
              
              <NodeCreationMenu
                contextType={contextType}
                projectId={projectId}
                worldId={worldId}
                getPosition={getPosition}
                onClose={() => setDropdownOpen(false)}
                onOpenModal={handleOpenModal}
                renderItem={(children, onClick) => (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      onClick();
                    }}
                    className="flex items-center gap-3 cursor-pointer p-2"
                  >
                    {children}
                  </DropdownMenuItem>
                )}
              />
            </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent>Add Node To Canvas</TooltipContent>
      </Tooltip>

      {/* Modal rendered outside the dropdown AND tooltip so it survives close */}
      {modalOpen && modalProjectId && (
        <EventStopper>
          <NewEntityModal
            isOpen={modalOpen}
            onClose={() => {
              setModalOpen(false);
            }}
            entityType={modalEntityType}
            initialImageFile={null}
            projectId={modalProjectId}
          />
        </EventStopper>
      )}
    </>
  );
}
