import * as React from "react";
import { createPortal } from "react-dom";
import {
  Trash2,
  RotateCcw,
  Sparkles,
  User,
  MapPin,
  Package,
  Palette,
  BookOpen,
  Clapperboard,
  ImageIcon,
} from "lucide-react";
import type { CanvasNode, ImageNodeFlag } from "#client/domain/canvas/NodeTypes.js";
import { useNodeStore } from "#client/store/useNodeStore.js";
import { useCanvasUIStore } from "#client/store/useCanvasUIStore.js";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { debouncedPersistLayout } from "#client/store/middleware/canvasIndexedDBStorage.js";
import { cn } from "#client/lib/utils.js";
import { addStyleReferenceFromNode } from "#client/lib/api.js";

interface NodeContextMenuProps {
  children: React.ReactNode;
  node: CanvasNode;
  onDelete: (node: CanvasNode) => void;
  onRestore?: (node: CanvasNode) => void;
  isSoftDeleted: boolean;
  onContextMenu?: (event: React.MouseEvent) => void;
}

function persistNodes(node: CanvasNode) {
  const updatedNodes = useNodeStore.getState().nodes;
  if (node.data.contextId && node.data.contextType) {
    debouncedPersistLayout(updatedNodes, node.data.contextId, node.data.contextType);
  }
}

const PROMOTE_OPTIONS: {
  flag: ImageNodeFlag;
  label: string;
  icon: React.ElementType;
  badge?: string;
}[] = [
  { flag: "character" as any, label: "Set as Character", icon: User },
  { flag: "location" as any, label: "Set as Location", icon: MapPin },
  { flag: "prop" as any, label: "Set as Prop", icon: Package },
  { flag: "style_reference" as any, label: "Set as Style Ref", icon: Palette },
  { flag: "lore" as any, label: "Set as Lore Image", icon: BookOpen },
  {
    flag: "scene_frame" as any,
    label: "Set as Scene Frame",
    icon: Clapperboard,
  },
  { flag: "import" as any, label: "Set as Image Asset", icon: ImageIcon },
];

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

  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside, true);
    document.addEventListener("contextmenu", handleClickOutside, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("contextmenu", handleClickOutside, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [isOpen]);

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
  }, [isOpen]);

  const close = () => setIsOpen(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
    onContextMenu?.(e);
  };

  const setFlag = async (e: React.MouseEvent, flag: ImageNodeFlag) => {
    e.stopPropagation();
    const prevFlag = node.data.nodeTypeFlag;
    
    useNodeStore.getState().updateNodeData(node.id, { nodeTypeFlag: flag });
    persistNodes(node);
    close();

    const projectId = node.data.contextId;
    if (node.data.contextType !== "project" || !projectId) return;

    if (flag === "style_reference" && prevFlag !== "style_reference") {
      try {
        const result = await addStyleReferenceFromNode({
          projectId,
          fileId: node.data.entityId, // fileId matches entityId for dropped images
        });
        useProjectStore.getState().addStyleReference(result.gcsUri);
      } catch (err) {
        console.error("Failed to set as style reference:", err);
      }
    }
  };

  const handleOpenSceneEditor = (e: React.MouseEvent) => {
    e.stopPropagation();
    useCanvasUIStore.getState().setEditingSceneId(node.data.entityId);
    close();
  };

  const isImageNode = node.type === "image";
  const isSceneNode = node.type === "scene";
  const isLocked = node.data.isLocked;
  const currentFlag = node.data.nodeTypeFlag;

  return (
    <div className="relative h-full w-full" onContextMenu={handleContextMenu}>
      {children}

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[300] min-w-[200px] overflow-hidden rounded-none border border-border bg-popover p-1 text-popover-foreground shadow-xl"
            style={{ left: position.x, top: position.y }}
          >
            {isImageNode && (
              <>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                  Set Image Use
                </div>
                {PROMOTE_OPTIONS.map((opt) => (
                  <button
                    key={opt.flag}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none transition-colors",
                      "hover:bg-accent hover:text-accent-foreground text-foreground",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      setFlag(e, opt.flag);
                    }}
                  >
                    <opt.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 text-left">{opt.label}</span>
                    {currentFlag === opt.flag && (
                      <span className="text-[9px] font-medium px-1 py-0.5 bg-muted rounded-none text-muted-foreground">
                        current
                      </span>
                    )}
                  </button>
                ))}
                <div className="-mx-1 my-1 h-px bg-muted" />
              </>
            )}

            {isSceneNode && (
              <>
                <button
                  className={cn(
                    "flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none transition-colors",
                    "hover:bg-accent hover:text-accent-foreground text-foreground",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenSceneEditor(e);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 text-left">Open Scene Editor</span>
                </button>
                <div className="-mx-1 my-1 h-px bg-muted" />
              </>
            )}

            {isSoftDeleted && onRestore ? (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none transition-colors",
                  "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(node);
                  close();
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Restore to Canvas</span>
              </button>
            ) : (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-none px-2 py-1.5 text-sm outline-none transition-colors",
                  "hover:bg-destructive/10 hover:text-destructive text-muted-foreground",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node);
                  close();
                }}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 text-left">Delete from Canvas</span>
              </button>
            )}

            <div className="-mx-1 my-1 h-px bg-muted" />

            <div className="px-2 py-1 text-[10px] text-muted-foreground/50 pointer-events-none select-none font-mono">
              {node.type}
              {currentFlag ? ` · ${currentFlag}` : ""}
              {isLocked ? " · locked" : ""}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
