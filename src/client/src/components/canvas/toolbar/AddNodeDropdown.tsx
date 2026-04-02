import React, { useState, useCallback } from 'react';
import { Plus, User, MapPin, Clapperboard, Music, FileImage, Layers } from 'lucide-react';
import { Button } from '#client/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#client/components/ui/dropdown-menu.js';
import { NewEntityModal } from '#client/components/canvas/panels/NewEntityModal.js';
import { NodeFactory } from '#client/domain/canvas/NodeFactory.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import type { CanvasNodeType } from '../../../../../shared/types/canvas.types.js';
import { calculateAutoLayoutPosition } from '#client/domain/canvas/CoordinateSystem.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#client/components/ui/tooltip.js';

export interface AddNodeDropdownProps {
  /** 'project' or 'world' context */
  contextType: 'project' | 'world';
  /** The projectId (required for project context when using NewEntityModal) */
  projectId?: string;
  /** The worldId (required for world context) */
  worldId?: string;
  /** Ref to the ReactFlow wrapper element for coordinate calculations */
  wrapperRef?: React.RefObject<HTMLDivElement | null>;
  /** Additional className for the trigger button */
  className?: string;
}

/** Node types that use NewEntityModal for creation (project context only) */
const MODAL_ENTITY_TYPES = ['character', 'location', 'scene'] as const;
type ModalEntityType = typeof MODAL_ENTITY_TYPES[number];

/** All available node types (excluding metadata) */
const NODE_TYPE_OPTIONS: {
  type: CanvasNodeType;
  label: string;
  icon: React.ElementType;
  description: string;
  /** Requires project context and NewEntityModal */
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

export function AddNodeDropdown({
  contextType,
  projectId,
  worldId,
  wrapperRef,
  className,
}: AddNodeDropdownProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalEntityType, setModalEntityType] = useState<ModalEntityType>('character');

  const { nodes, addNode } = useNodeStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const autoLayout = useCanvasUIStore((s) => s.autoLayout);

  const createNodeDirectly = useCallback(
    (type: CanvasNodeType) => {
      const contextId = contextType === 'project' ? (projectId || selectedProjectId || '') : (worldId || '');
      const scope = contextType as 'project' | 'world';

      // Calculate position
      let finalPosition: { x: number; y: number };

      if (autoLayout) {
        finalPosition = calculateAutoLayoutPosition(nodes, type);
      } else {
        finalPosition = {
          x: 400 + Math.random() * 200,
          y: 300 + Math.random() * 200,
        };
      }

      // Generate a unique entityId for directly-created nodes
      const entityId = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const newNode = NodeFactory.createNode({
        type,
        entityId,
        contextId,
        contextType: contextType,
        posCanvas: finalPosition,
        scope,
      });

      addNode(newNode);
      console.debug('[AddNodeDropdown] Created node directly', { type, entityId, position: finalPosition });
    },
    [contextType, projectId, worldId, selectedProjectId, nodes, addNode, autoLayout],
  );

  /**
   * Handles clicking a node type option.
   * For modal types in project context: opens NewEntityModal
   * Otherwise: creates node directly
   */
  const handleAddNode = useCallback(
    (option: (typeof NODE_TYPE_OPTIONS)[number]) => {
      const { type, requiresModal } = option;

      // Use modal for character/location/scene in project context
      if (requiresModal && contextType === 'project') {
        setModalEntityType(type as ModalEntityType);
        setModalOpen(true);
      } else {
        createNodeDirectly(type);
      }
    },
    [contextType, createNodeDirectly],
  );

  // Get the projectId to use with the modal
  const modalProjectId = projectId || selectedProjectId || '';

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`gap-2 ${className || ''}`}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Node</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Add Node
              </div>
              <DropdownMenuSeparator />

              {NODE_TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isModalOption = option.requiresModal && contextType === 'project';

                return (
                  <DropdownMenuItem
                    key={option.type}
                    onClick={() => handleAddNode(option)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {option.description}
                        {isModalOption && (
                          <span className="ml-1 text-primary">(with form)</span>
                        )}
                      </span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipTrigger>
        <TooltipContent>Add Node To Canvas</TooltipContent>
      </Tooltip>

      {/* NewEntityModal for character/location/scene creation */}
      {modalOpen && modalProjectId && (
        <NewEntityModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          entityType={modalEntityType}
          initialImageFile={null}
          projectId={modalProjectId}
        />
      )}
    </>
  );
}
