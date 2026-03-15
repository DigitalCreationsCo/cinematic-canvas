import React, { useState } from "react";
import { User, MapPin, Music, FileImage, Sparkles, Plus } from "lucide-react";
import { Button } from "#/components/ui/button.js";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "#/lib/utils.js";
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { useWorldEntities } from '../../../hooks/useWorldEntities.js';
import { NewEntityModal } from './NewEntityModal.js';

type AssetType = 'character' | 'location' | 'audio' | 'style';

interface DraggableAssetProps {
  id: string;
  type: AssetType;
  name: string;
  img?: string;
  isOnCanvas: boolean;
  onDragStart: (e: React.DragEvent, type: AssetType, entityId: string) => void;
  isWorldEntity?: boolean;
}

const DraggableAsset = ({ id, type, name, img, isOnCanvas, onDragStart, isWorldEntity }: DraggableAssetProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type, name, entityId: id },
    disabled: isOnCanvas,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      draggable={!isOnCanvas}
      onDragStart={(e) => !isOnCanvas && onDragStart(e, type, id)}
      title={isOnCanvas ? `${name} is already on the canvas` : name}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md border border-transparent transition-colors group",
        isOnCanvas
          ? "opacity-40 grayscale cursor-not-allowed"
          : "hover:bg-accent hover:border-border cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
        isWorldEntity && "border-primary/20 bg-primary/5"
      )}
    >
      <div className="w-6 h-6 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {img ? (
          <img src={img} alt={name} className="w-full h-full object-cover" />
        ) : type === 'audio' ? (
          <Music size={10} className="text-muted-foreground" />
        ) : (
          <FileImage size={10} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] font-medium truncate text-foreground/90 group-hover:text-foreground leading-tight">
          {name} {isWorldEntity && <span className="text-[9px] text-primary ml-1">(World)</span>}
        </span>
        {isOnCanvas && (
          <span className="text-[9px] font-mono text-muted-foreground/50">on canvas</span>
        )}
      </div>
    </div>
  );
};

interface ColumnDef {
  key: string;
  icon: React.ElementType;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'characters', icon: User, label: 'Characters' },
  { key: 'locations', icon: MapPin, label: 'Locations' },
  { key: 'audio', icon: Music, label: 'Audio Tracks' },
  { key: 'style', icon: Sparkles, label: 'Style Refs' },
];

const FOOTER_H = 32; // px — height of the icon/label bar
const CLOSED_W = 28; // px — width of a closed column while others are open
const SQUARE_W = 32; // px — size of closed columns when ALL are closed
const MAX_H = 200;

export function TopAssetPanel({ contextId, contextType }: { contextId: string; contextType: 'project' | 'world'; }) {
  const { characters, locations, selectedProjectId } = useProjectStore();
  const { nodes } = useNodeStore();
  const { worldCharacters, worldLocations } = useWorldEntities();

  const [openCols, setOpenCols] = useState<Record<string, boolean>>({
    characters: false,
    locations: false,
    audio: false,
    style: false,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'character' | 'location' | 'scene'>('character');
  const [draggedImage, setDraggedImage] = useState<File | null>(null);
  const [draggedFileType, setDraggedFileType] = useState<'character' | 'location' | 'audio' | 'style' | null>(null);

  const isEntityOnCanvas = (entityId: string) =>
    nodes.some((n) => n.data.entityId === entityId);

  const handleDragStart = (e: React.DragEvent, type: AssetType, entityId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, entityId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      let validFile = false;
      let type: 'character' | 'location' | 'scene' = 'character';

      // Validate file type based on column
      switch (colKey) {
        case 'characters':
          if (file.type.startsWith('image/')) {
            validFile = true;
            type = 'character';
          }
          break;
        case 'locations':
          if (file.type.startsWith('image/')) {
            validFile = true;
            type = 'location';
          }
          break;
        case 'audio':
          if (file.type.startsWith('audio/')) {
            validFile = true;
            // For audio, we'll just trigger the modal without file preview for now
            // In a real implementation, you might want to handle audio differently
            setModalType('character'); // Reuse character modal for audio for now
            setDraggedImage(null); // No image preview for audio
            setDraggedFileType('audio');
            setModalOpen(true);
            return;
          }
          break;
        case 'style':
          if (file.type.startsWith('image/')) {
            validFile = true;
            type = 'scene'; // Style refs use the scene modal
          }
          break;
      }

      if (validFile) {
        setModalType(type);
        setDraggedImage(file);
        setDraggedFileType(colKey as 'character' | 'location' | 'audio' | 'style');
        setModalOpen(true);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    console.log(`[TopAssetPanel] handleDragOver for ${colKey}:`, e.dataTransfer.files?.length);
    // Open column when dragging over it
    if (!openCols[colKey]) {
      setOpenCols((prev) => ({ ...prev, [colKey]: true }));
      console.log(`[TopAssetPanel] Opening column ${colKey}`);
    }

    const isFileDrag = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');

    if (isFileDrag) {
      // In dragover event we don't have access to file object or its type yet for security reasons.
      // So we have to accept any file during the drag, and validate it when dropped.
      e.dataTransfer.dropEffect = 'copy';
    } else {
      // For dragging assets from panel, allow copy
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDragLeave = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    // Close column when leaving (unless it was manually opened)
    // We'll keep it open for better UX when dragging files
    // Only close if it was automatically opened by drag over
    // For simplicity, we'll leave columns open during drag operations
  };

  const toggleCol = (key: string) =>
    setOpenCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const openCount = Object.values(openCols).filter(Boolean).length;
  const allClosed = openCount === 0;
  const closedCols = COLUMNS.length - openCount;

  // Concrete widths the browser can interpolate — no flex-1 / undefined.
  const closedW = allClosed ? SQUARE_W : CLOSED_W;
  const openWidth = openCount > 0
    ? `calc((100% - ${closedCols * closedW}px) / ${openCount})`
    : '0px';

  const characterList = Array.from(characters.values());
  const locationList = Array.from(locations.values());
  const wCharacterList = Object.values(worldCharacters);
  const wLocationList = Object.values(worldLocations);

  const columnContent: Record<string, React.ReactNode> = {
    characters: (
      <>
        {(characterList.length === 0 && wCharacterList.length === 0) ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No characters found</p>
        ) : (
          <>
            {characterList.map((item) => (
              <DraggableAsset
                key={item.id} id={item.id} type="character" name={item.name}
                isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart}
              />
            ))}
            {wCharacterList.map((item) => (
              <DraggableAsset
                key={item.id} id={item.id} type="character" name={item.name}
                isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart}
                isWorldEntity
              />
            ))}
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setModalType('character'); setDraggedImage(null); setModalOpen(true); }}
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Character
        </Button>
        {/* Drop indicator when no files are being dragged */}
        {!draggedImage && (
          <p className="text-[10px] text-muted-foreground px-2 py-1 text-center italic">
            Drag an image here to create a character
          </p>
        )}
      </>
    ),
    locations: (
      <>
        {(locationList.length === 0 && wLocationList.length === 0) ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No locations found</p>
        ) : (
          <>
            {locationList.map((item) => (
              <DraggableAsset
                key={item.id} id={item.id} type="location" name={item.name}
                isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart}
              />
            ))}
            {wLocationList.map((item) => (
              <DraggableAsset
                key={item.id} id={item.id} type="location" name={item.name}
                isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart}
                isWorldEntity
              />
            ))}
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setModalType('location'); setDraggedImage(null); setModalOpen(true); }}
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Location
        </Button>
        {/* Drop indicator when no files are being dragged */}
        {!draggedImage && (
          <p className="text-[10px] text-muted-foreground px-2 py-1 text-center italic">
            Drag an image here to create a location
          </p>
        )}
      </>
    ),
    audio: (
      <>
        <p className="text-[10px] text-muted-foreground px-2 py-1">No audio assets found</p>
        <Button variant="ghost" size="sm"
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Audio
        </Button>
        {/* Drop indicator when no files are being dragged */}
        {!draggedImage && (
          <p className="text-[10px] text-muted-foreground px-2 py-1 text-center italic">
            Drag an audio file here to upload
          </p>
        )}
      </>
    ),
    style: (
      <>
        <p className="text-[10px] text-muted-foreground px-2 py-1">No style refs found</p>
        <Button variant="ghost" size="sm"
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Style Ref
        </Button>
        {/* Drop indicator when no files are being dragged */}
        {!draggedImage && (
          <p className="text-[10px] text-muted-foreground px-2 py-1 text-center italic">
            Drag an image here to create a style reference
          </p>
        )}
      </>
    ),
  };

  return (
    <>
      <div
        className={cn(
          "w-full flex flex-row",
          allClosed ? "justify-center" : "",
          "bg-card/60 border-b border-border overflow-hidden"
        )}
        style={{
          height: allClosed ? `${SQUARE_W}px` : `${MAX_H}px`,
          minHeight: `${SQUARE_W}px`,
          transition: 'height 100ms ease-in-out',
        }}
      >
        {COLUMNS.map((col) => {
          const isOpen = openCols[col.key];
          const Icon = col.icon;
          const colW = isOpen ? openWidth : `${closedW}px`;

          return (
            <div
              key={col.key}
              onDrop={(e) => handleDrop(e, col.key)}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={(e) => handleDragLeave(e, col.key)}
              onClick={() => !isOpen && toggleCol(col.key)}
              className={cn(
                "relative flex flex-col shrink-0 border-r border-border last:border-r-0 overflow-hidden",
                !isOpen && "hover:bg-accent/30 cursor-pointer",
                !allClosed && openCount > 0 && !isOpen && "justify-end self-end"
              )}
              style={{
                width: colW,
                minWidth: colW,
                maxWidth: colW,
                transition: 'width 100ms ease-in-out, min-width 100ms ease-in-out, max-width 100ms ease-in-out',
              }}
            >
              {isOpen && (
                <div
                  className="flex-1 overflow-y-auto"
                  style={{
                    flex: '1 1 0px',
                  }}
                >
                  <div className="flex flex-col gap-0.5 px-1 py-1">
                    {columnContent[col.key]}
                  </div>
                </div>
              )}

              <div
                onClick={(e) => { e.stopPropagation(); toggleCol(col.key); }}
                className={cn(
                  "flex flex-row justify-center px-2",
                  isOpen || allClosed ? "items-center" : "items-end",
                  isOpen ? "gap-1.5 border-t border-border/40" : "",
                  "cursor-pointer"
                )}
                style={{
                  height: allClosed ? `${SQUARE_W}px` : `${FOOTER_H}px`,
                  flex: '0 0 auto',
                }}
              >
                <Icon
                  size={13}
                  className={cn(
                    "shrink-0 transition-colors duration-150",
                    isOpen || allClosed ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span
                  className="text-[10px] font-mono font-semibold tracking-wide text-muted-foreground truncate"
                  style={{
                    maxWidth: isOpen ? '999px' : '0px',
                    opacity: isOpen ? 1 : 0,
                    marginLeft: isOpen ? undefined : '0px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    transition: 'max-width 100ms ease-in-out, opacity 150ms ease-in-out',
                  }}
                >
                  {col.label.toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global drag over canvas indicator */}
      <div className="absolute inset-0 pointer-events-none">
        {!draggedImage && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-lg opacity-0 transition-opacity duration-200"
            id="canvas-drag-indicator">
            Drop files on the Asset Panel to add them
          </div>
        )}
      </div>

      {modalOpen && selectedProjectId && (
        <NewEntityModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setDraggedImage(null);
            setDraggedFileType(null);
          }}
          entityType={modalType}
          initialImageFile={draggedImage}
          projectId={selectedProjectId}
        />
      )}
    </>
  );
}