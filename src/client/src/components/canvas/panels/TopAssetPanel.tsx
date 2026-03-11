import React, { useState } from "react";
import { ScrollArea } from "#/components/ui/scroll-area.js";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion.js";
import { User, MapPin, Music, FileImage, Search, Plus, Sparkles } from "lucide-react";
import { Input } from "#/components/ui/input.js";
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
        "flex items-center gap-2 p-1.5 rounded-md border border-transparent transition-colors group",
        isOnCanvas
          ? "opacity-40 grayscale cursor-not-allowed"
          : "hover:bg-accent hover:border-border cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      ) }
    >
      <div className="w-8 h-8 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        { img ? (
          <img src={ img } alt={ name } className="w-full h-full object-cover" />
        ) : type === 'audio' ? (
          <Music size={ 14 } className="text-muted-foreground" />
        ) : (
          <FileImage size={ 14 } className="text-muted-foreground" />
        ) }
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium truncate text-foreground/90 group-hover:text-foreground">
          { name }
        </span>
        <span className="text-[9px] font-mono text-muted-foreground uppercase">{ id }</span>
      </div>
      { isOnCanvas && (
        <span className="ml-auto text-[9px] font-mono text-muted-foreground/60 shrink-0">on canvas</span>
      ) }
    </div>
  );
};

export function TopAssetPanel({ contextId, contextType }: { contextId: string, contextType: 'project' | 'world'; }) {
  const { characters, locations } = useProjectStore();
  const { nodes } = useNodeStore();
  const [ search, setSearch ] = useState('');

  const isEntityOnCanvas = (entityId: string) =>
    nodes.some((n) => n.data.entityId === entityId);

  const handleDragStart = (e: React.DragEvent, type: AssetType, entityId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, entityId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filterBySearch = <T extends { name: string; }>(items: T[]) =>
    search.trim()
      ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
      : items;

  const characterList = filterBySearch(Object.values(characters));
  const locationList = filterBySearch(Object.values(locations));

  return (
    <div className="flex flex-col h-full bg-card/50">
      {/* Header */ }
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-mono font-bold tracking-wider mb-2 flex items-center justify-between">
          WORLD ASSETS
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 rounded-sm hover:bg-primary hover:text-primary-foreground"
          >
            <Plus size={ 12 } />
          </Button>
        </h2>
        <div className="relative">
          <Search size={ 12 } className="absolute left-2 top-2 text-muted-foreground" />
          <Input
            placeholder="Filter assets..."
            value={ search }
            onChange={ (e) => setSearch(e.target.value) }
            className="h-7 text-xs pl-7 bg-background border-border font-mono"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Accordion
          type="multiple"
          defaultValue={ [ 'characters', 'locations', 'audio', 'style' ] }
          className="px-2"
        >
          {/* Characters */ }
          <AccordionItem value="characters" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <User size={ 14 } />
                <span className="font-semibold">Characters ({ characterList.length })</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              { characterList.length === 0 ? (
                <p className="text-[10px] text-muted-foreground px-2 py-1">No characters found</p>
              ) : (
                characterList.map((item) => (
                  <DraggableAsset
                    key={ item.id }
                    id={ item.id }
                    type="character"
                    name={ item.name }
                    isOnCanvas={ isEntityOnCanvas(item.id) }
                    onDragStart={ handleDragStart }
                  />
                ))
              ) }
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-7"
              >
                <Plus className="w-3 h-3 mr-1" /> New Character
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Locations */ }
          <AccordionItem value="locations" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <MapPin size={ 14 } />
                <span className="font-semibold">Locations ({ locationList.length })</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              { locationList.length === 0 ? (
                <p className="text-[10px] text-muted-foreground px-2 py-1">No locations found</p>
              ) : (
                  locationList.map((item) => (
                    <DraggableAsset
                      key={ item.id }
                      id={ item.id }
                      type="location"
                      name={ item.name }
                      isOnCanvas={ isEntityOnCanvas(item.id) }
                      onDragStart={ handleDragStart }
                    />
                  ))
              ) }
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-7"
              >
                <Plus className="w-3 h-3 mr-1" /> New Location
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Audio — no store data yet, kept as stub */ }
          <AccordionItem value="audio" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <Music size={ 14 } />
                <span className="font-semibold">Audio Tracks (0)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              <p className="text-[10px] text-muted-foreground px-2 py-1">No audio assets found</p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-7"
              >
                <Plus className="w-3 h-3 mr-1" /> New Audio
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Style Refs — no store data yet, kept as stub */ }
          <AccordionItem value="style" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <Sparkles size={ 14 } />
                <span className="font-semibold">Style Refs (0)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              <p className="text-[10px] text-muted-foreground px-2 py-1">No style refs found</p>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-7"
              >
                <Plus className="w-3 h-3 mr-1" /> New Style Ref
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Dropzone hint */ }
        <div className="p-4 mt-4 mx-2 border border-dashed border-border rounded-md bg-muted/20 flex flex-col items-center justify-center text-center gap-2 opacity-50">
          <FileImage size={ 16 } className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground leading-tight">
            Drag & Drop external files here to import as World Assets
          </span>
        </div>
      </ScrollArea>
    </div>
  );
}