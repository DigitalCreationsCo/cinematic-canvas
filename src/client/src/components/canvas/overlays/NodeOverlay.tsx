import { Trash2, X } from 'lucide-react';
import { Button } from '#client/components/ui/button.js';
import type { CanvasNode } from '#client/domain/canvas/NodeTypes.js';

const MIN_ZOOM_FOR_OVERLAY = 0.3;

interface NodeOverlayProps {
  node: CanvasNode;
  zoom: number;
  onDelete: (node: CanvasNode) => void;
}

export function NodeOverlay({ node, zoom, onDelete }: NodeOverlayProps) {
  if (zoom < MIN_ZOOM_FOR_OVERLAY) {
    return null;
  }

  const canDelete = node.type !== 'metadata';

  if (zoom < MIN_ZOOM_FOR_OVERLAY || !canDelete) {
    return null;
  }

  return (
    <div
      className="absolute top-2 right-2 z-50 flex items-center gap-1 animate-in fade-in zoom-in duration-150"
      style={{
        transform: 'translate(50%, -50%)',
      }}
    >
      <Button
        variant="destructive"
        size="icon"
        className="h-6 w-6 rounded-full shadow-lg hover:scale-110 transition-transform"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(node);
        }}
        title="Delete node"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface SoftDeletedOverlayProps {
  node: CanvasNode;
}

export function SoftDeletedOverlay({ node }: SoftDeletedOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-40 pointer-events-none"
    >
      <div className="absolute inset-0 bg-destructive/10 border-2 border-destructive/50 rounded-none" />
      <div className="absolute top-2 left-2">
        <span className="text-[10px] font-mono font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded">
          REMOVED
        </span>
      </div>
    </div>
  );
}
