import React, { useState, useCallback, useEffect, useRef } from 'react';
import { User, MapPin, Clapperboard, Music, FileImage, Layers, MessageCircle } from 'lucide-react';
import { NewEntityModal } from '#client/components/canvas/panels/NewEntityModal.js';
import { NodeFactory } from '#client/domain/canvas/NodeFactory.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { useUIMenuStore } from '#client/store/useUIMenuStore.js';
import { EventStopper } from '#client/components/ui/event-stopper.js';
import type { CanvasNodeType } from '../../../../../shared/types/canvas.types.js';
import { calculateAutoLayoutPosition } from '#client/domain/canvas/CoordinateSystem.js';

export interface CanvasContextMenuProps {
  contextType: 'project' | 'world';
  projectId?: string;
  worldId?: string;
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
  open: boolean;
  onClose: () => void;
}

const MODAL_ENTITY_TYPES = ['character', 'location', 'scene'] as const;
type ModalEntityType = typeof MODAL_ENTITY_TYPES[number];

const NODE_TYPE_OPTIONS: {
  type: CanvasNodeType;
  label: string;
  icon: React.ElementType;
  description: string;
  requiresModal?: boolean;
}[] = [
    {
      type: 'character',
      label: 'Character',
      icon: User,
      description: 'Character entity with portrait and traits',
      requiresModal: true,
    },
    {
      type: 'location',
      label: 'Location',
      icon: MapPin,
      description: 'Location with atmosphere and weather',
      requiresModal: true,
    },
    {
      type: 'scene',
      label: 'Scene',
      icon: Clapperboard,
      description: 'Video scene with cinematography',
      requiresModal: true,
    },
    {
      type: 'audio',
      label: 'Audio Track',
      icon: Music,
      description: 'Audio or music reference',
      requiresModal: false,
    },
    {
      type: 'image',
      label: 'Image',
      icon: FileImage,
      description: 'Image asset (style ref, import, or lore)',
      requiresModal: false,
    },
    {
      type: 'composite',
      label: 'Composite',
      icon: Layers,
      description: 'Multi-input image merge',
      requiresModal: false,
    },
    {
      type: 'render',
      label: 'Render Output',
      icon: Clapperboard,
      description: 'Final video assembly output',
      requiresModal: false,
    },
  ];

export function CanvasContextMenu({
  contextType,
  projectId,
  worldId,
  position,
  canvasPosition,
  open,
  onClose,
}: CanvasContextMenuProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntityType, setModalEntityType] = useState<ModalEntityType>('character');
  const menuRef = useRef<HTMLDivElement>(null);


  const { nodes, addNode } = useNodeStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);
  const toggleMessagesSidebar = useCanvasUIStore((s) => s.toggleMessagesSidebar);

  const contextId = contextType === 'project'
    ? (projectId || selectedProjectId || '')
    : (worldId || '');

  // Use ref to avoid stale closure in event listener
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Close menu when clicking outside or when a dropdown opens
  const isDropdownOpen = useUIMenuStore((s) => s.isDropdownOpen);
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      // Modal handles its own close on outside click, so don't close context menu
      if (modalOpen) return;
      onCloseRef.current();
    };
    // Capture phase: React Flow stops propagation internally
    const CAPTURE_PHASE = true;
    document.addEventListener('mousedown', handleClickOutside, CAPTURE_PHASE);
    return () => document.removeEventListener('mousedown', handleClickOutside, CAPTURE_PHASE);
  }, [open, modalOpen]);

  // Close context menu when a dropdown opens (e.g., AddNodeDropdown)
  useEffect(() => {
    if (isDropdownOpen && open) {
      onCloseRef.current();
    }
  }, [isDropdownOpen, open]);

  const createNodeDirectly = useCallback(
    (type: CanvasNodeType) => {
      let finalPosition: { x: number; y: number };

      if (autoLayout) {
        finalPosition = calculateAutoLayoutPosition(nodes, type);
      } else {
        finalPosition = {
          x: canvasPosition.x + (Math.random() - 0.5) * 50,
          y: canvasPosition.y + (Math.random() - 0.5) * 50,
        };
      }

      const entityId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const newNode = NodeFactory.createNode({
        type,
        entityId,
        contextId,
        contextType: contextType,
        posCanvas: finalPosition,
        scope: contextType as 'project' | 'world',
      });

      addNode(newNode);
      console.debug('[CanvasContextMenu] Created node directly', { type, entityId, position: finalPosition });
      onClose();
    },
    [contextType, projectId, worldId, selectedProjectId, nodes, addNode, autoLayout, canvasPosition, onClose],
  );

  const handleItemClick = useCallback(
    (option: (typeof NODE_TYPE_OPTIONS)[number]) => {
      const { type, requiresModal } = option;

      if (requiresModal && contextType === 'project') {
        // Open modal immediately without waiting for dropdown animation
        setModalEntityType(type as ModalEntityType);
        setModalOpen(true);
      } else {
        createNodeDirectly(type);
      }
    },
    [contextType, createNodeDirectly],
  );

  const handleModalClose = useCallback(() => {
    setModalOpen(false);
    onClose();
  }, [onClose]);

  // Reset modal when context menu closes
  useEffect(() => {
    if (!open) {
      setModalOpen(false);
    }
  }, [open]);

  const modalProjectId = projectId || selectedProjectId || '';

  if (!open) return null;

  return (
    <>
      <div
        ref={menuRef}
        className="fixed z-[100] min-w-[220px] overflow-hidden rounded-none border bg-popover p-1 text-popover-foreground shadow-md"
        style={{
          left: position.x,
          top: position.y,
        }}
      >
        <button
          type="button"
          onClick={toggleMessagesSidebar}
          className="flex w-full items-center gap-3 rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-none bg-muted shrink-0">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex flex-col min-w-0 text-left">
            <span className="text-sm font-medium">Open Chat</span>
            <span className="text-xs text-muted-foreground truncate">
              Chat with Story Assistant
            </span>
          </div>
        </button>
        <div className="-mx-1 my-1 h-px bg-muted" />

        <div className="p-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Add Node
        </div>
        <div className="-mx-1 my-1 h-px bg-muted" />

        {NODE_TYPE_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              type="button"
              key={option.type}
              onClick={() => handleItemClick(option)}
              className="flex w-full items-center gap-3 rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-none bg-muted shrink-0">
                <Icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {option.description}
                  {option.requiresModal && contextType === 'project' && (<></>
                  )}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {modalOpen && modalProjectId && (
        <EventStopper>
          <NewEntityModal
            isOpen={modalOpen}
            onClose={handleModalClose}
            entityType={modalEntityType}
            initialImageFile={null}
            projectId={modalProjectId}
          />
        </EventStopper>
      )}
    </>
  );
}
