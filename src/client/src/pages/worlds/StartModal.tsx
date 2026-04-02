import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Plus, FolderOpen, Film } from "lucide-react";
import React from "react";

interface StartModalProps {
  isOpen: boolean;
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
}

export const StartModal: React.FC<StartModalProps> = ({ isOpen, onSelectAction }) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="card-cinematic-glass sm:max-w-5xl px-24 py-12">
        <DialogHeader className="mb-8 items-center text-center">
          <DialogTitle className="text-4xl font-heading uppercase mb-2 text-foreground/80">Welcome to Cinematic Canvas</DialogTitle>
          <DialogDescription className="text-lg">
            How would you like to begin?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-120">
          <Button
            variant="outline"
            className="flex flex-col items-center justify-center gap-4 border-0.5 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => onSelectAction("project")}
          >
            <div className="text-center">
              <span className="text-xs text-muted-foreground mt-1 font-mono uppercase">Load a cinematic project</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="flex flex-col items-center justify-center gap-4 border-0.5 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => onSelectAction("load-world")}
          >
            <div className="text-center">
              <span className="text-xs text-muted-foreground mt-1 font-mono uppercase">Explore an existing world</span>
            </div>
          </Button>


          <Button
            variant="outline"
            className="flex flex-col items-center justify-center gap-4 border-0.5 hover:border-primary hover:bg-primary/5 transition-all"
            onClick={() => onSelectAction("new-world")}
          >
            <div className="text-center">
              <span className="text-xs text-muted-foreground mt-1 font-mono uppercase">Dream a new world</span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
