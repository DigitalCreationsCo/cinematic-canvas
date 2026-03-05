import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#/components/ui/dialog.js";
import { Button } from "#/components/ui/button.js";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "#/components/ui/card.js";
import { ArrowLeft, ArrowRight, FolderOpen } from "lucide-react";

interface World {
  id: string;
  name: string;
  description: string;
  projectsCount: number;
}

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
  onShowProjects 
}) => {
  // Mock data for now, until we wire up the API
  const worlds: World[] = [
    { id: "world-1", name: "Cyberpunk City", description: "Neon-drenched dystopian metropolis in 2077.", projectsCount: 3 },
    { id: "world-2", name: "Fantasy Realm", description: "Medieval magical kingdom with dragons and ancient ruins.", projectsCount: 1 },
    { id: "world-3", name: "Deep Space Station", description: "Isolated scientific research outpost near a black hole.", projectsCount: 0 }
  ];

  return (
    <Dialog open={isOpen}>
      <DialogContent hideCloseButton onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { e.preventDefault(); onBack(); }} className="sm:max-w-[800px] h-[80vh] flex flex-col p-0 overflow-hidden bg-background/95 backdrop-blur">
        <DialogHeader className="p-6 pb-2 shrink-0 border-b">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Button>
            <div>
              <DialogTitle className="text-2xl font-bold">Your Worlds</DialogTitle>
              <DialogDescription>
                Select an existing world to continue building or view its projects.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto p-6 bg-muted/10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {worlds.map(world => (
              <Card key={world.id} className="group hover:border-primary/50 transition-colors flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-4">
                    <CardTitle className="text-xl leading-tight line-clamp-2">{world.name}</CardTitle>
                    <div className="bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0">
                      {world.projectsCount} Project{world.projectsCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {world.description}
                  </p>
                </CardContent>
                <CardFooter className="pt-4 border-t gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1 text-xs sm:text-sm h-9"
                    onClick={() => onShowProjects(world.id)}
                  >
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Projects
                  </Button>
                  <Button 
                    className="flex-1 text-xs sm:text-sm h-9"
                    onClick={() => onSelectWorld(world.id)}
                  >
                    Enter World
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};