import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  User,
  MapPin,
  Clapperboard,
  Music,
  FileImage,
  Layers,
  MessageCircle,
  Gem
} from "lucide-react";
import { NewEntityModal } from "#client/components/canvas/panels/NewEntityModal.js";
import { NodeFactory } from "#client/domain/canvas/NodeFactory.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";
import { useChatStore } from "#client/store/useChatStore.js";
import { EventStopper } from "#client/components/ui/event-stopper.js";
import { calculateAutoLayoutPosition } from "#client/domain/canvas/CoordinateSystem.js";
import { EntityCreatableType } from "#shared/types/entity.types.js";
import type { CanvasNodeType } from "#shared/types/canvas.types.js";
import { DropdownMenuItem } from "#client/components/ui/dropdown-menu.js"; // Importing to be used in NodeCreationMenu

// Exporting options so AddNodeDropdown can use them
export const NODE_TYPE_OPTIONS: {
  type: CanvasNodeType;
  label: string;
  icon: React.ElementType;
  description: string;
  requiresModal?: boolean;
}[] = [
    {
      type: "character",
      label: "Character",
      icon: User,
      description: "Character entity with portrait and traits",
      requiresModal: true,
    },
    {
      type: "location",
      label: "Location",
      icon: MapPin,
      description: "Location with atmosphere and weather",
      requiresModal: true,
    },
    {
      type: "prop",
      label: "Prop",
      icon: Gem,
      description: "Prop with atmosphere and weather",
      requiresModal: true,
    },
    {
      type: "scene",
      label: "Scene",
      icon: Clapperboard,
      description: "Video scene with cinematography",
      requiresModal: true,
    },
    {
      type: "audio",
      label: "Audio Track",
      icon: Music,
      description: "Audio or music reference",
      requiresModal: false,
    },
    {
      type: "image",
      label: "Image",
      icon: FileImage,
      description: "Image asset (style ref, import, or lore)",
      requiresModal: false,
    },
    {
      type: "composite",
      label: "Composite",
      icon: Layers,
      description: "Multi-input image merge",
      requiresModal: false,
    },
    {
      type: "render",
      label: "Render Output",
      icon: Clapperboard,
      description: "Final video assembly output",
      requiresModal: false,
    },
  ];

export function NodeCreationMenu({
  contextType,
  projectId,
  worldId,
  getPosition,
  onClose,
  renderItem = (children, onClick, key) => (
    <button
      type="button"
      data-testid={`node-creation-menu-item-${key}`}
      key={key}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
    >
      {children}
    </button>
  ),
  onOpenModal,
}: {
  contextType: "project" | "world";
  projectId?: string;
  worldId?: string;
  getPosition: (type: CanvasNodeType) => { x: number; y: number };
  onClose: () => void;
  renderItem?: (children: React.ReactNode, onClick: () => void, key: string) => React.ReactNode;
  /** When provided, modal-requiring types call this instead of managing modal internally */
  onOpenModal?: (type: EntityCreatableType) => void;
}) {
  // Internal modal state — only used when onOpenModal is NOT provided (legacy path)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntityPrimitiveType, setModalEntityPrimitiveType] =
    useState<EntityCreatableType>("character");

  const { nodes, addNode } = useNodeStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const contextId =
    contextType === "project" ? projectId || selectedProjectId || "" : worldId || "";

  const createNode = useCallback(
    (type: CanvasNodeType) => {
      const finalPosition = getPosition(type);
      const entityId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const newNode = NodeFactory.createNode({
        type,
        entityId,
        contextId,
        contextType: contextType,
        posCanvas: finalPosition,
        scope: contextType as "project" | "world",
      });

      addNode(newNode);
      onClose();
    },
    [contextId, contextType, getPosition, addNode, onClose],
  );

  const handleItemClick = useCallback(
    (option: (typeof NODE_TYPE_OPTIONS)[number]) => {
      const { type, requiresModal } = option;

      if (requiresModal && contextType === "project") {
        if (onOpenModal) {
          // Let the parent manage modal lifecycle (parent also calls onClose)
          onOpenModal(type as EntityCreatableType);
        } else {
          // Legacy: manage modal internally
          setModalEntityPrimitiveType(type as EntityCreatableType);
          setModalOpen(true);
        }
      } else {
        createNode(type);
      }
    },
    [contextType, createNode, onOpenModal],
  );

  const modalProjectId = projectId || selectedProjectId || "";

  return (
    <>
      {NODE_TYPE_OPTIONS.map((option) => {
        const Icon = option.icon;
        return renderItem(
          <>
            <div className="flex items-center justify-center w-7 h-7 rounded-none shrink-0">
              <Icon className="w-4.55 h-4.5 text-muted-foreground" />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground truncate">
                {option.description}
              </span>
            </div>
          </>,
          () => handleItemClick(option),
          option.type,
        );
      })}
      {/* Only render internal modal when parent hasn't taken over modal management */}
      {!onOpenModal && modalOpen && modalProjectId && (
        <EventStopper>
          <NewEntityModal
            isOpen={modalOpen}
            onClose={() => {
              setModalOpen(false);
              onClose();
            }}
            entityType={modalEntityPrimitiveType}
            initialImageFile={null}
            projectId={modalProjectId}
          />
        </EventStopper>
      )}
    </>
  );
}

interface CanvasContextMenuProps {
  contextType: "project" | "world";
  projectId?: string;
  worldId?: string;
  position: {
    x: number;
    y: number;
  };
  canvasPosition: {
    x: number;
    y: number;
  };
  open: boolean;
  onClose: () => void;
}

export function CanvasContextMenu({
  contextType,
  projectId,
  worldId,
  position,
  canvasPosition,
  open,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const openChatSidebar = useUIMenuStore((s) => s.openChatSidebar);
  const { nodes } = useNodeStore();
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isDropdownOpen = useUIMenuStore((s) => s.isDropdownOpen);

  // ── Modal state (rendered outside the menu so it survives close) ────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntityPrimitiveType, setModalEntityPrimitiveType] =
    useState<EntityCreatableType>("character");
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const modalProjectId = projectId || selectedProjectId || "";

  const handleOpenModal = useCallback(
    (type: EntityCreatableType) => {
      setModalEntityPrimitiveType(type);
      setModalOpen(true);
      onClose(); // Close the context menu – modal is rendered at a higher level
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      onCloseRef.current();
    };
    const CAPTURE_PHASE = true;
    document.addEventListener("mousedown", handleClickOutside, CAPTURE_PHASE);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside, CAPTURE_PHASE);
  }, [open]);

  useEffect(() => {
    if (isDropdownOpen && open) {
      onCloseRef.current();
    }
  }, [isDropdownOpen, open]);

  const handleOpenChat = useCallback(() => {
    openChatSidebar();
    useChatStore.getState().setViewMode('chat');
    useChatStore.getState().focusChatInput();
    onClose();
  }, [openChatSidebar, onClose]);

  const getPosition = useCallback(
    (type: CanvasNodeType) => {
      if (autoLayout) {
        return calculateAutoLayoutPosition(nodes, type);
      }
      return {
        x: canvasPosition.x + (Math.random() - 0.5) * 50,
        y: canvasPosition.y + (Math.random() - 0.5) * 50,
      };
    },
    [autoLayout, nodes, canvasPosition],
  );

  return (
    <>
      {open && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[220px] overflow-hidden rounded-none border bg-popover text-popover-foreground shadow-md"
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          <button
            type="button"
            onClick={handleOpenChat}
            className="flex w-full items-center gap-3 rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-none shrink-0">
              <MessageCircle className="w-4.5 h-4.5 text-muted-foreground" />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="text-sm font-medium">Open Chat</span>
              <span className="text-xs text-muted-foreground truncate">
                Chat with Assistant
              </span>
            </div>
          </button>
          <div className="-mx-1 my-1 h-px bg-muted" />

          <div className="p-2 font-medium text-[10px] text-muted-foreground/50 font-mono">
            Add Node
          </div>
          <div className="-mx-1 my-1 h-px bg-muted" />

          <NodeCreationMenu
            contextType={contextType}
            projectId={projectId}
            worldId={worldId}
            getPosition={getPosition}
            onClose={onClose}
            onOpenModal={handleOpenModal}
          />
        </div>
      )}

      {/* Modal rendered outside the menu div so it survives context menu close */}
      {modalOpen && modalProjectId && (
        <EventStopper>
          <NewEntityModal
            isOpen={modalOpen}
            onClose={() => {
              setModalOpen(false);
              onClose();
            }}
            entityType={modalEntityPrimitiveType}
            initialImageFile={null}
            projectId={modalProjectId}
          />
        </EventStopper>
      )}
    </>
  );
}

