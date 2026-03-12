import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#/components/ui/dialog.js";
import { Button } from "#/components/ui/button.js";
import { Plus, FolderOpen, Film } from "lucide-react";
import React from "react";

interface StartModalProps {
  isOpen: boolean;
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
}

export const StartModal: React.FC<StartModalProps> = ({ isOpen, onSelectAction }) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="sm:max-w-[700px] p-8 border-none bg-background/95 backdrop-blur shadow-2xl">
        <DialogHeader className="mb-8 items-center text-center">
          <DialogTitle className="text-3xl font-bold tracking-tight mb-2">Welcome to Cinematic Canvas</DialogTitle>
          <DialogDescription className="text-base">
            How would you like to begin?
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-rows-3 gap-6">
          <Button 
            variant="outline" 
            className="h-40 flex flex-col items-center justify-center gap-4 border-2 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={ () => onSelectAction("project") }
          >
            <div className="bg-primary/10 p-3 rounded-full">
              <Film className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <span className="text-lg font-semibold block">Projects</span>
              <span className="text-xs text-muted-foreground mt-1">Load a cinematic project</span>
            </div>
          </Button>

          <Button 
            variant="outline" 
            className="h-40 flex flex-col items-center justify-center gap-4 border-2 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={ () => onSelectAction("load-world") }
          >
            <div className="bg-primary/10 p-3 rounded-full">
              <FolderOpen className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <span className="text-lg font-semibold block">Load World</span>
              <span className="text-xs text-muted-foreground mt-1">Explore an existing world</span>
            </div>
          </Button>


          <Button
            variant="outline"
            className="h-40 flex flex-col items-center justify-center gap-4 border-2 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={ () => onSelectAction("new-world") }
          >
            <div className="bg-primary/10 p-3 rounded-full">
              <Plus className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <span className="text-lg font-semibold block">New World</span>
              <span className="text-xs text-muted-foreground mt-1">Dream a new world</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
