import React from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Save, LayoutGrid, Settings, Film, Undo, Redo, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function TopNav() {
  return (
    <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-primary">
          <Film size={20} className="fill-current" />
          <span className="font-mono font-bold tracking-tight text-sm text-foreground">CINE_NODE // PIPELINE</span>
        </div>
        
        <div className="h-4 w-px bg-border mx-2" />
        
        <div className="flex flex-col">
          <span className="text-xs font-semibold leading-none">Project: Cyber_Heist_V2</span>
          <span className="text-[10px] text-muted-foreground leading-none mt-0.5">Last saved: 2 mins ago</span>
        </div>
        
        <Badge variant="outline" className="text-[10px] ml-2 bg-success/10 text-success border-success/20">
          ALL SYSTEMS NOMINAL
        </Badge>
      </div>
      
      <div className="flex items-center gap-1.5">
        <div className="flex bg-muted rounded-md p-0.5 mr-4">
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-sm text-muted-foreground hover:text-foreground">
            <Undo size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-sm text-muted-foreground hover:text-foreground">
            <Redo size={14} />
          </Button>
        </div>

        <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
          <LayoutGrid size={14} className="mr-2" />
          AUTO-LAYOUT
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
          <Save size={14} className="mr-2" />
          SAVE
        </Button>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
          <Settings size={14} />
        </Button>
        <div className="h-4 w-px bg-border mx-1" />
        <Button size="sm" className="h-8 bg-success hover:bg-success/90 text-success-foreground text-xs font-mono font-bold">
          <Play size={14} className="mr-2 fill-current" />
          RENDER ALL
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
          <Download size={14} className="mr-2" />
          EXPORT
        </Button>
      </div>
    </div>
  );
}