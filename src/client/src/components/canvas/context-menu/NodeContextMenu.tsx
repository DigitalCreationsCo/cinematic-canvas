import * as React from 'react';
import { createPortal } from 'react-dom';
import { Trash2, RotateCcw, Sparkles, FileText } from 'lucide-react';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { debouncedPersistLayout } from '#client/store/middleware/canvasIndexedDBStorage.js';

interface NodeContextMenuProps {
  children: React.ReactNode;
  node: CanvasNode;
  onDelete: (node: CanvasNode) => void;
  onRestore?: (node: CanvasNode) => void;
  isSoftDeleted: boolean;
  onContextMenu?: (event: React.MouseEvent) => void;
}

export function NodeContextMenu({
  children,
  node,
  onDelete,
  onRestore,
  isSoftDeleted,
  onContextMenu
}: NodeContextMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('contextmenu', handleClickOutside, true);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('contextmenu', handleClickOutside, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
    if (onContextMenu) {
      onContextMenu(e);
    }
  };

  const setAsStyleRef = (e: React.MouseEvent) => {
    e.stopPropagation();
    useNodeStore.getState().updateNodeData(node.id, { nodeTypeFlag: 'style_reference' });

    const updatedNodes = useNodeStore.getState().nodes;
    if (node.data.contextId && node.data.contextType) {
      debouncedPersistLayout(updatedNodes, node.data.contextId, node.data.contextType);
    }

    setIsOpen(false);
  };

  return (
    <div className="relative h-full w-full" onContextMenu={handleContextMenu}>
      {children}
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[8rem] overflow-hidden rounded-none border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            left: position.x,
            top: position.y
          }}
        >
          {node.type === 'image' && node.data.nodeTypeFlag === 'import' && (
            <button
              className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onClick={setAsStyleRef}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Set as Style Ref
            </button>
          )}
          {node.type === 'scene' && (
            <button
              className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                useCanvasUIStore.getState().setEditingSceneId(node.data.entityId);
                setIsOpen(false);
              }}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Open Scene Editor
            </button>
          )}
          {isSoftDeleted && onRestore ? (
            <button
              className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onRestore?.(node); setIsOpen(false); }}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore to Canvas
            </button>
          ) : (
            <button
              className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onDelete(node); setIsOpen(false); }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete from Canvas
            </button>
          )}
          <div className="-mx-1 my-1 h-px bg-muted" />
          <div className="px-2 py-1.5 text-sm text-muted-foreground pointer-events-none">
            Node: {node.type}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
