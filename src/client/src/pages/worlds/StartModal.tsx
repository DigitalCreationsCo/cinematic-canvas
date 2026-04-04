import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import React, { useCallback } from "react";

interface StartModalProps {
  isOpen: boolean;
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
}

interface ActionButtonProps {
  label: string;
  action: "new-world" | "load-world" | "project";
  onSelectAction: StartModalProps["onSelectAction"];
  image: string;
  posImage: string;
}

const ActionButton: React.FC<ActionButtonProps> = React.memo(({ label, action, image, onSelectAction, posImage }) => {
  const handleClick = useCallback(
    () => onSelectAction(action),
    [onSelectAction, action],
  );

  return (
    <Button
      variant="outline"
      className="group relative flex flex-col items-center justify-center gap-4 border-0.5 hover:border-primary hover:bg-opacity-50 transition-all"
      onClick={handleClick}
    >
      <img src={image} alt={label} className={`absolute inset-0 w-full h-full object-cover scale-[110%] -z-10 opacity-30 group-hover:opacity-70 transition-all ${posImage}`} />
      <div className="text-center">
        <span className="text-xs text-primary mt-1 font-mono uppercase">{label}</span>
      </div>
    </Button>
  );
});

ActionButton.displayName = "ActionButton";

export const StartModal: React.FC<StartModalProps> = React.memo(({ isOpen, onSelectAction }) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} className="card-cinematic-glass sm:max-w-5xl px-24 py-12">
        <DialogHeader className="mb-8 items-center text-center">
          <DialogTitle className="text-4xl font-heading uppercase mb-2 text-foreground/80">Welcome to Cinematic Canvas</DialogTitle>
          <DialogDescription className="text-base">
            How would you like to begin?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-120">
          <ActionButton
            label="Load a cinematic project"
            action="project"
            onSelectAction={onSelectAction}
            image={"/load-project.png"}
            posImage={"object-[50%_50%]"}
          />
          <ActionButton
            label="Dream a new world"
            action="new-world"
            onSelectAction={onSelectAction}
            image={"/dream-world.png"}
            posImage={"object-[20%_50%]"}
          />
          <ActionButton
            label="Explore an existing world"
            action="load-world"
            onSelectAction={onSelectAction}
            image={"/explore-world.png"}
            posImage={"object-[50%_50%]"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
});

StartModal.displayName = "StartModal";