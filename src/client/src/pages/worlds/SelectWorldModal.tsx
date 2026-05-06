import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { useWorlds } from "#client/hooks/useWorlds.js";
import { Loader2, ArrowLeft, ArrowRight, FolderOpen } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#client/components/ui/card.js";
import { Loader } from "#client/components/Loader.js";

interface SelectWorldModalProps {
  isOpen: boolean;
  onBack: () => void;
  onSelectWorld: (worldId: string) => void;
  onShowProjects: (worldId: string) => void;
}

export const SelectWorldModal: React.FC<SelectWorldModalProps> = ({
  isOpen,
  onBack,
  onSelectWorld,
  onShowProjects,
}) => {
  const { worlds, isLoading, isError } = useWorlds();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onBack();
        }
      }}
    >
      <DialogContent
        data-testid="select-world-modal"
        onPointerDownOutside={(e) => e.preventDefault()}
        className="sm:max-w-[800px] h-[80vh] border flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur"
      >
        <DialogHeader className="p-6 pb-2 shrink-0 border-b">
          <div className="flex items-center gap-4">
            <div>
              <DialogTitle className="text-2xl font-bold">Your Worlds</DialogTitle>
              <DialogDescription>
                Select an existing world to continue building or view its projects.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          {isLoading && (
            <div
              data-testid="icon-loader"
              className="flex items-center justify-center h-full"
            >
              <Loader />
            </div>
          )}
          {isError && (
            <div className="flex items-center justify-center h-full text-destructive">
              Failed to load worlds. Please try again.
            </div>
          )}

          {!isLoading && !isError && (
            <div
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
              data-testid="worlds-grid"
            >
              {worlds.map((world) => (
                <Card
                  key={world.id}
                  data-testid="world-card"
                  className="group hover:border-primary/50 transition-colors flex flex-col"
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="text-xl leading-tight line-clamp-2">
                      {world.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {world.description}
                    </p>
                  </CardContent>
                  <CardFooter className="pt-4 border-t gap-3">
                    <Button
                      data-testid="button-world-projects"
                      variant="outline"
                      className="flex-1 text-xs sm:text-sm h-9"
                      onClick={() => onShowProjects(world.id)}
                    >
                      <FolderOpen className="w-4 h-4 mr-2" />
                      Projects
                    </Button>
                    <Button
                      data-testid="button-enter-world"
                      className="flex-1 text-xs sm:text-sm h-9"
                      onClick={() => onSelectWorld(world.id)}
                    >
                      Enter World
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
              {worlds.length === 0 && (
                <p data-testid="no-worlds-message">No worlds found.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
