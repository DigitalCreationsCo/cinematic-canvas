import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, MapPin, Music, FileImage, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

import charThumb1 from "@/assets/images/char-thumb-1.png";
import locThumb1 from "@/assets/images/loc-thumb-1.png";

// Draggable item component
const DraggableAsset = ({ id, type, name, img }: { id: string, type: string, name: string, img?: string }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: id,
    data: { type, name }
  });

  return (
    <div 
      ref={setNodeRef} 
      {...listeners} 
      {...attributes}
      className={cn(
        "flex items-center gap-2 p-1.5 rounded-md hover:bg-accent cursor-grab active:cursor-grabbing border border-transparent hover:border-border transition-colors group",
        isDragging && "opacity-50"
      )}
    >
      <div className="w-8 h-8 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {img ? (
          <img src={img} alt={name} className="w-full h-full object-cover" />
        ) : type === 'audio' ? (
          <Music size={14} className="text-muted-foreground" />
        ) : (
          <FileImage size={14} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium truncate text-foreground/90 group-hover:text-foreground">{name}</span>
        <span className="text-[9px] font-mono text-muted-foreground uppercase">{id}</span>
      </div>
    </div>
  );
};

export function WorldAssetPanel() {
  return (
    <div className="flex flex-col h-full bg-card/50">
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-mono font-bold tracking-wider mb-2 flex items-center justify-between">
          WORLD ASSETS
          <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm hover:bg-primary hover:text-primary-foreground">
            <Plus size={12} />
          </Button>
        </h2>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-2 text-muted-foreground" />
          <Input 
            placeholder="Filter assets..." 
            className="h-7 text-xs pl-7 bg-background border-border font-mono"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <Accordion type="multiple" defaultValue={["characters", "locations", "audio"]} className="px-2">
          
          <AccordionItem value="characters" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <User size={14} />
                <span className="font-semibold">Characters (2)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              <DraggableAsset id="char-1" type="character" name="Aria (Hacker)" img={charThumb1} />
              <DraggableAsset id="char-2" type="character" name="Security Drone" />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="locations" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <MapPin size={14} />
                <span className="font-semibold">Locations (3)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              <DraggableAsset id="loc-1" type="location" name="City Overview" img={locThumb1} />
              <DraggableAsset id="loc-2" type="location" name="Neon Cafe" />
              <DraggableAsset id="loc-3" type="location" name="Back Alley" />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="audio" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs hover:no-underline [&[data-state=open]>div>svg]:text-primary">
              <div className="flex items-center gap-2 text-muted-foreground transition-colors">
                <Music size={14} />
                <span className="font-semibold">Audio Tracks (1)</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="pb-2 flex flex-col gap-1">
              <DraggableAsset id="aud-1" type="audio" name="Cyberpunk_Chase.wav" />
            </AccordionContent>
          </AccordionItem>

        </Accordion>
        
        {/* Dropzone hint area */}
        <div className="p-4 mt-4 mx-2 border border-dashed border-border rounded-md bg-muted/20 flex flex-col items-center justify-center text-center gap-2 opacity-50">
          <FileImage size={16} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground leading-tight">Drag & Drop external files here to import as World Assets</span>
        </div>
      </ScrollArea>
    </div>
  );
}