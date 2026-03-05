import React from "react";
import { Button } from "#/components/ui/button.js";
import { ArrowLeft, Globe } from "lucide-react";

interface WorldBuilderProps {
  onBack: () => void;
}

export const WorldBuilder: React.FC<WorldBuilderProps> = ({ onBack }) => {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center relative p-8">
      <div className="absolute top-8 left-8">
        <Button variant="ghost" onClick={ onBack } className="gap-2">
          <Globe className="w-4 h-4" />
          Exit Builder
        </Button>
      </div>

      <div className="max-w-4xl w-full text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">World Builder</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Create the foundational setting, characters, and rules for your cinematic canvas.
        </p>

        <div className="p-12 border-2 border-dashed rounded-xl bg-muted/20 text-muted-foreground flex items-center justify-center mt-12 min-h-[400px]">
          [ World Builder Canvas Coming Soon ]
        </div>
      </div>
    </div>
  );
};
