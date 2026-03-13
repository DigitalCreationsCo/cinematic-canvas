import React from "react";
import { Button } from "#/components/ui/button.js";
import { Play, Pause, Save, LayoutGrid, Settings, Film, Undo, Redo, Download } from "lucide-react";
import { Badge } from "#/components/ui/badge.js";

export function TopNav() {
  return (
    <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 z-10">
      <div className="flex items-center gap-4">
        <div className="h-4 w-px bg-border mx-2" />

        <div className="flex flex-col">
          <span className="text-xs font-semibold leading-none">Project: Cyber_Heist_V2</span>
          <span className="text-[10px] text-muted-foreground leading-none mt-0.5">Last saved: 2 mins ago</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">


        <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
          <LayoutGrid size={ 14 } className="mr-2" />
          AUTO-LAYOUT
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
          <Save size={ 14 } className="mr-2" />
          SAVE
        </Button>
        <Button variant="outline" size="sm" className="h-8 w-8 p-0">
          <Settings size={ 14 } />
        </Button>
        <div className="h-4 w-px bg-border mx-1" />
        <Button size="sm" className="h-8 bg-success hover:bg-success/90 text-success-foreground text-xs font-mono font-bold">
          <Play size={ 14 } className="mr-2 fill-current" />
          RENDER ALL
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs font-mono">
          <Download size={ 14 } className="mr-2" />
          EXPORT
        </Button>
      </div>
    </div>
  );
}