import React, { useState } from "react";
import { User, MapPin, Music, FileImage, Sparkles, Plus } from "lucide-react";
import { Button } from "#/components/ui/button.js";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "#/lib/utils.js";
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';

type AssetType = 'character' | 'location' | 'audio' | 'style';

interface DraggableAssetProps {
  id: string;
  type: AssetType;
  name: string;
  img?: string;
  isOnCanvas: boolean;
  onDragStart: (e: React.DragEvent, type: AssetType, entityId: string) => void;
}

const DraggableAsset = ({ id, type, name, img, isOnCanvas, onDragStart }: DraggableAssetProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type, name, entityId: id },
    disabled: isOnCanvas,
  });

  return (
    <div
      ref={ setNodeRef }
      { ...listeners }
      { ...attributes }
      draggable={ !isOnCanvas }
      onDragStart={ (e) => !isOnCanvas && onDragStart(e, type, id) }
      title={ isOnCanvas ? `${name} is already on the canvas` : name }
      className={ cn(
        "flex items-center gap-2 px-2 py-1 rounded-md border border-transparent transition-colors group",
        isOnCanvas
          ? "opacity-40 grayscale cursor-not-allowed"
          : "hover:bg-accent hover:border-border cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      ) }
    >
      <div className="w-6 h-6 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        { img ? (
          <img src={ img } alt={ name } className="w-full h-full object-cover" />
        ) : type === 'audio' ? (
            <Music size={ 10 } className="text-muted-foreground" />
        ) : (
              <FileImage size={ 10 } className="text-muted-foreground" />
        ) }
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] font-medium truncate text-foreground/90 group-hover:text-foreground leading-tight">
          { name }
        </span>
        { isOnCanvas && (
          <span className="text-[9px] font-mono text-muted-foreground/50">on canvas</span>
        ) }
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
  const { characters, locations } = useProjectStore();
  const { nodes } = useNodeStore();

  const [ openCols, setOpenCols ] = useState<Record<string, boolean>>({
    characters: true,
    locations: false,
    audio: false,
    style: false,
  });

  const isEntityOnCanvas = (entityId: string) =>
    nodes.some((n) => n.data.entityId === entityId);

  const handleDragStart = (e: React.DragEvent, type: AssetType, entityId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, entityId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const toggleCol = (key: string) =>
    setOpenCols((prev) => ({ ...prev, [ key ]: !prev[ key ] }));

  const openCount = Object.values(openCols).filter(Boolean).length;
  const allClosed = openCount === 0;
  const closedCols = COLUMNS.length - openCount;

  // Concrete widths the browser can interpolate — no flex-1 / undefined.
  const closedW = allClosed ? SQUARE_W : CLOSED_W;
  const openWidth = openCount > 0
    ? `calc((100% - ${closedCols * closedW}px) / ${openCount})`
    : '0px';

  const characterList = Object.values(characters);
  const locationList = Object.values(locations);

  const columnContent: Record<string, React.ReactNode> = {
    characters: (
      <>
        { characterList.length === 0 ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No characters found</p>
        ) : (
          characterList.map((item) => (
            <DraggableAsset
              key={ item.id } id={ item.id } type="character" name={ item.name }
              isOnCanvas={ isEntityOnCanvas(item.id) } onDragStart={ handleDragStart }
            />
          ))
        ) }
        <Button variant="ghost" size="sm"
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Character
        </Button>
      </>
    ),
    locations: (
      <>
        { locationList.length === 0 ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No locations found</p>
        ) : (
          locationList.map((item) => (
            <DraggableAsset
              key={ item.id } id={ item.id } type="location" name={ item.name }
              isOnCanvas={ isEntityOnCanvas(item.id) } onDragStart={ handleDragStart }
            />
          ))
        ) }
        <Button variant="ghost" size="sm"
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Location
        </Button>
      </>
    ),
    audio: (
      <>
        <p className="text-[10px] text-muted-foreground px-2 py-1">No audio assets found</p>
        <Button variant="ghost" size="sm"
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Audio
        </Button>
      </>
    ),
    style: (
      <>
        <p className="text-[10px] text-muted-foreground px-2 py-1">No style refs found</p>
        <Button variant="ghost" size="sm"
          className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Style Ref
        </Button>
      </>
    ),
  };

  return (
    <div
      className="w-full flex flex-row items-stretch bg-card/60 border-b border-border overflow-hidden"
      style={ {
        height: allClosed ? `${SQUARE_W}px` : `${MAX_H}px`,
        minHeight: `${SQUARE_W}px`,
        transition: 'height 100ms ease-in-out',
      } }
    >
      { COLUMNS.map((col) => {
        const isOpen = openCols[ col.key ];
        const Icon = col.icon;
        const colW = isOpen ? openWidth : `${closedW}px`;

        return (
          <div
            key={ col.key }
            onClick={ () => toggleCol(col.key) }
            className={ cn(
              "relative flex justify-end flex-col shrink-0 border-r border-border last:border-r-0 overflow-hidden",
              !isOpen && "hover:bg-accent/30 cursor-pointer"
            ) }
            style={ {
              width: colW,
              minWidth: colW,
              maxWidth: colW,
              transition: 'width 100ms ease-in-out, min-width 100ms ease-in-out, max-width 100ms ease-in-out',
            } }
          >
            {/* ── Scrollable content — grid-template-rows collapse (no reflow) ── */ }
            <div
              onClick={ (e) => e.stopPropagation() }
              className={ isOpen ? "h-full" : "h-min" }
              style={ {
                display: 'grid',
                gridTemplateRows: isOpen ? '1fr' : '0fr',
                opacity: isOpen ? 1 : 0,
                pointerEvents: isOpen ? 'auto' : 'none',
                // grid-template-rows avoids full layout reflow; opacity is compositor-only
                transition: 'grid-template-rows 100ms ease-in-out, opacity 150ms ease-in-out',
              } }
            >
              {/* min-h-0 is required for the 0fr row to actually collapse to zero */ }
              <div className="flex flex-1 overflow-y-auto min-h-0">
                <div className="flex flex-1 flex-col gap-0.5 px-1 py-1">
                  { columnContent[ col.key ] }
                </div>
              </div>
            </div>

            {/* ── Footer: icon + label ── */ }
            <div
              className={ cn(
                "flex items-center select-none",
                isOpen ? "gap-1.5 px-2 border-t border-border/40 cursor-pointer" : "justify-center cursor-pointer"
              ) }
              style={ {
                height: allClosed ? `${SQUARE_W}px` : `${FOOTER_H}px`,
                transition: 'height 100ms ease-in-out',
              } }
            >
              <Icon
                size={ 13 }
                className={ cn(
                  "shrink-0 transition-colors duration-150",
                  isOpen ? "text-primary" : "text-muted-foreground"
                ) }
              />
              <span
                className="text-[10px] font-mono font-semibold tracking-wide text-muted-foreground truncate"
                style={ {
                  maxWidth: isOpen ? '999px' : '0px',
                  opacity: isOpen ? 1 : 0,
                  marginLeft: isOpen ? undefined : '0px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  transition: 'max-width 100ms ease-in-out, opacity 150ms ease-in-out',
                } }
              >
                { col.label.toUpperCase() }
              </span>
            </div>
          </div>
        );
      }) }
    </div>
  );
}