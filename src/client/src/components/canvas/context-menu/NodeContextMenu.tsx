// import * as React from 'react';
// import { createPortal } from 'react-dom';
// import { Trash2, RotateCcw, Sparkles, FileText } from 'lucide-react';
// import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';
// import { useNodeStore } from '#client/store/useNodeStore.js';
// import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
// import { debouncedPersistLayout } from '#client/store/middleware/canvasIndexedDBStorage.js';

// interface NodeContextMenuProps {
//   children: React.ReactNode;
//   node: CanvasNode;
//   onDelete: (node: CanvasNode) => void;
//   onRestore?: (node: CanvasNode) => void;
//   isSoftDeleted: boolean;
//   onContextMenu?: (event: React.MouseEvent) => void;
// }

// export function NodeContextMenu({
//   children,
//   node,
//   onDelete,
//   onRestore,
//   isSoftDeleted,
//   onContextMenu
// }: NodeContextMenuProps) {
//   const [isOpen, setIsOpen] = React.useState(false);
//   const [position, setPosition] = React.useState({ x: 0, y: 0 });
//   const menuRef = React.useRef<HTMLDivElement>(null);

//   React.useEffect(() => {
//     if (!isOpen) return;

//     const handleClickOutside = (e: MouseEvent) => {
//       if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
//         setIsOpen(false);
//       }
//     };

//     const handleEscape = (e: KeyboardEvent) => {
//       if (e.key === 'Escape') setIsOpen(false);
//     };

//     document.addEventListener('mousedown', handleClickOutside, true);
//     document.addEventListener('contextmenu', handleClickOutside, true);
//     document.addEventListener('keydown', handleEscape, true);
//     return () => {
//       document.removeEventListener('mousedown', handleClickOutside, true);
//       document.removeEventListener('contextmenu', handleClickOutside, true);
//       document.removeEventListener('keydown', handleEscape, true);
//     };
//   }, [isOpen]);

//   const handleContextMenu = (e: React.MouseEvent) => {
//     e.preventDefault();
//     e.stopPropagation();
//     setPosition({ x: e.clientX, y: e.clientY });
//     setIsOpen(true);
//     if (onContextMenu) {
//       onContextMenu(e);
//     }
//   };

//   const setAsStyleRef = (e: React.MouseEvent) => {
//     e.stopPropagation();
//     useNodeStore.getState().updateNodeData(node.id, { nodeTypeFlag: 'style_reference' });

//     const updatedNodes = useNodeStore.getState().nodes;
//     if (node.data.contextId && node.data.contextType) {
//       debouncedPersistLayout(updatedNodes, node.data.contextId, node.data.contextType);
//     }

//     setIsOpen(false);
//   };

//   return (
//     <div className="relative h-full w-full" onContextMenu={handleContextMenu}>
//       {children}
//       {isOpen && createPortal(
//         <div
//           ref={menuRef}
//           className="fixed z-50 min-w-[8rem] overflow-hidden rounded-none border bg-popover p-1 text-popover-foreground shadow-md"
//           style={{
//             left: position.x,
//             top: position.y
//           }}
//         >
//           {node.type === 'image' && node.data.nodeTypeFlag === 'import' && (
//             <button
//               className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
//               onClick={setAsStyleRef}
//             >
//               <Sparkles className="mr-2 h-4 w-4" />
//               Set as Style Ref
//             </button>
//           )}
//           {node.type === 'scene' && (
//             <button
//               className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
//               onClick={(e) => {
//                 e.stopPropagation();
//                 useCanvasUIStore.getState().setEditingSceneId(node.data.entityId);
//                 setIsOpen(false);
//               }}
//             >
//               <Sparkles className="mr-2 h-4 w-4" />
//               Open Scene Editor
//             </button>
//           )}
//           {isSoftDeleted && onRestore ? (
//             <button
//               className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
//               onClick={(e) => { e.stopPropagation(); onRestore?.(node); setIsOpen(false); }}
//             >
//               <RotateCcw className="mr-2 h-4 w-4" />
//               Restore to Canvas
//             </button>
//           ) : (
//             <button
//               className="flex w-full items-center rounded-none px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
//               onClick={(e) => { e.stopPropagation(); onDelete(node); setIsOpen(false); }}
//             >
//               <Trash2 className="mr-2 h-4 w-4" />
//               Delete from Canvas
//             </button>
//           )}
//           <div className="-mx-1 my-1 h-px bg-muted" />
//           <div className="px-2 py-1.5 text-sm text-muted-foreground pointer-events-none">
//             Node: {node.type}
//           </div>
//         </div>,
//         document.body
//       )}
//     </div>
//   );
// }

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2,
  RotateCcw,
  Sparkles,
  User,
  MapPin,
  Package,
  Palette,
  BookOpen,
  Copy,
  Lock,
  Unlock,
  Clapperboard,
  ImageIcon,
  SeparatorHorizontal,
} from 'lucide-react';
import type { CanvasNode, ImageNodeFlag } from '#client/domain/canvas/NodeTypes.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { debouncedPersistLayout } from '#client/store/middleware/canvasIndexedDBStorage.js';
import { cn } from '#client/lib/utils.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NodeContextMenuProps {
  children: React.ReactNode;
  node: CanvasNode;
  onDelete: (node: CanvasNode) => void;
  onRestore?: (node: CanvasNode) => void;
  isSoftDeleted: boolean;
  onContextMenu?: (event: React.MouseEvent) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function persistNodes(node: CanvasNode) {
  const updatedNodes = useNodeStore.getState().nodes;
  if (node.data.contextId && node.data.contextType) {
    debouncedPersistLayout(updatedNodes, node.data.contextId, node.data.contextType);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-muted" />;
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
      {children}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  variant?: 'default' | 'destructive' | 'promote';
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none transition-colors cursor-pointer',
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        variant === 'destructive' && 'hover:bg-destructive/10 hover:text-destructive text-muted-foreground',
        variant === 'promote' && 'hover:bg-accent hover:text-accent-foreground text-foreground',
        variant === 'default' && 'hover:bg-accent hover:text-accent-foreground text-muted-foreground',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="text-[9px] font-medium px-1 py-0.5 bg-muted rounded-none text-muted-foreground">
          {badge}
        </span>
      )}
    </button>
  );
}

// ─── Promote sub-menu (inline, not nested) ────────────────────────────────────

const PROMOTE_OPTIONS: {
  flag: ImageNodeFlag;
  label: string;
  icon: React.ElementType;
  badge?: string;
}[] = [
    { flag: 'character' as any, label: 'Set as Character', icon: User },
    { flag: 'location' as any, label: 'Set as Location', icon: MapPin },
    { flag: 'prop' as any, label: 'Set as Prop', icon: Package },
    { flag: 'style_reference' as any, label: 'Set as Style Ref', icon: Palette },
    { flag: 'lore' as any, label: 'Set as Lore Image', icon: BookOpen },
    { flag: 'scene_frame' as any, label: 'Set as Scene Frame', icon: Clapperboard },
    { flag: 'import' as any, label: 'Set as Image Asset', icon: ImageIcon },
  ];

// ─── Main Component ───────────────────────────────────────────────────────────

export function NodeContextMenu({
  children,
  node,
  onDelete,
  onRestore,
  isSoftDeleted,
  onContextMenu,
}: NodeContextMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const menuRef = React.useRef<HTMLDivElement>(null);

  // ── Event listeners ─────────────────────────────────────────────────────────
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

  // Clamp menu position to viewport on open
  React.useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const adjustedX = Math.min(position.x, vw - rect.width - 8);
    const adjustedY = Math.min(position.y, vh - rect.height - 8);
    if (adjustedX !== position.x || adjustedY !== position.y) {
      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const close = () => setIsOpen(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
    onContextMenu?.(e);
  };

  // Generic: update nodeTypeFlag + persist
  const setFlag = (e: React.MouseEvent, flag: ImageNodeFlag) => {
    e.stopPropagation();
    useNodeStore.getState().updateNodeData(node.id, { nodeTypeFlag: flag });
    persistNodes(node);
    close();
  };

  // Duplicate node
  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { nodes, addNode } = useNodeStore.getState();
    const original = nodes.find((n) => n.id === node.id);
    if (!original) return;
    const newId = `${original.type}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const offset = 40;
    const duplicate = {
      ...original,
      id: newId,
      position: {
        x: (original.position?.x ?? 0) + offset,
        y: (original.position?.y ?? 0) + offset,
      },
      data: {
        ...original.data,
        entityId: newId,
      },
      selected: false,
    };
    addNode(duplicate);
    persistNodes(node);
    close();
  };

  // Toggle lock
  const handleToggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    const isLocked = node.data.isLocked;
    useNodeStore.getState().updateNodeData(node.id, { isLocked: !isLocked });
    persistNodes(node);
    close();
  };

  // Open scene editor
  const handleOpenSceneEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    useCanvasUIStore.getState().setEditingSceneId(node.data.entityId);
    close();
  };

  // ── Derived state ────────────────────────────────────────────────────────────
  const isImageNode = node.type === 'image';
  const isSceneNode = node.type === 'scene';
  const isLocked = node.data.isLocked;
  const currentFlag = node.data.nodeTypeFlag;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full" onContextMenu={handleContextMenu}>
      {children}

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[300] min-w-[200px] overflow-hidden rounded-none border border-border bg-popover p-1 text-popover-foreground shadow-xl"
          style={{ left: position.x, top: position.y }}
        >

          {/* ── Image: promote section ──────────────────────────────────────── */}
          {isImageNode && (
            <>
              <MenuLabel>Set Image Use</MenuLabel>
              {PROMOTE_OPTIONS.map((opt) => (
                <MenuItem
                  key={opt.flag}
                  icon={opt.icon}
                  label={opt.label}
                  variant="promote"
                  badge={currentFlag === opt.flag ? 'current' : undefined}
                  onClick={(e) => setFlag(e, opt.flag)}
                />
              ))}
              <MenuSeparator />
            </>
          )}

          {/* ── Scene-specific ──────────────────────────────────────────────── */}
          {isSceneNode && (
            <>
              <MenuItem
                icon={Sparkles}
                label="Open Scene Editor"
                variant="promote"
                onClick={handleOpenSceneEditor}
              />
              <MenuSeparator />
            </>
          )}

          {/* ── Universal actions ───────────────────────────────────────────── */}
          <MenuLabel>Node</MenuLabel>
          <MenuItem
            icon={Copy}
            label="Duplicate"
            onClick={handleDuplicate}
          />
          <MenuItem
            icon={isLocked ? Unlock : Lock}
            label={isLocked ? 'Unlock Node' : 'Lock Node'}
            onClick={handleToggleLock}
          />

          <MenuSeparator />

          {/* ── Delete / Restore ────────────────────────────────────────────── */}
          {isSoftDeleted && onRestore ? (
            <MenuItem
              icon={RotateCcw}
              label="Restore to Canvas"
              onClick={(e) => { e.stopPropagation(); onRestore(node); close(); }}
            />
          ) : (
            <MenuItem
              icon={Trash2}
              label="Delete from Canvas"
              variant="destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(node); close(); }}
            />
          )}

          <MenuSeparator />

          {/* ── Debug info ──────────────────────────────────────────────────── */}
          <div className="px-2 py-1 text-[10px] text-muted-foreground/50 pointer-events-none select-none font-mono">
            {node.type}{currentFlag ? ` · ${currentFlag}` : ''}
            {isLocked ? ' · locked' : ''}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}