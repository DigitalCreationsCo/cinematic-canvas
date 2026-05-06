import React from "react";
import { Globe } from "lucide-react";
import { Button } from "#client/components/ui/button.js";
import { useWorldStore } from "#client/store/useWorldStore.js";
import { CreateWorldModal } from "#client/pages/worlds/CreateWorldModal.js";
import { World } from "#shared/types/schema.types.js";
import Header from "#client/components/Header.js";

interface WorldBuilderProps {
  onBack: () => void;
}

export const WorldBuilder: React.FC<WorldBuilderProps> = ({ onBack }) => {
  const activeWorldId = useWorldStore((s) => s.worldId);
  const worldName = useWorldStore((s) => s.worldName);
  const setWorld = useWorldStore((s) => s.setWorld);
  const [isCreateModalOpen, setCreateModalOpen] = React.useState(false);

  // This function would be called when a user tries to create their first asset
  const handleAddFirstAsset = () => {
    if (!activeWorldId) {
      setCreateModalOpen(true);
    } else {
      // Proceed with asset creation logic...
      console.log("Proceeding with asset creation for world:", activeWorldId);
    }
  };

  const handleWorldCreated = (world: World) => {
    setWorld(world.id);
    console.log("World created and set as active:", world.id);
    // Now you could proceed with the asset creation that was pending
  };

  return (
    <>
      <Header />
      <div
        data-testid="world-builder"
        className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center relative p-8"
      >
        <div className="absolute top-8 left-8">
          <Button
            data-testid="button-back"
            variant="ghost"
            onClick={onBack}
            className="gap-2"
          >
            <Globe className="w-4 h-4" />
            Exit Builder
          </Button>
        </div>

        <div className="max-w-4xl w-full text-center space-y-8">
          <h1
            data-testid="title-world-builder"
            className="text-5xl font-bold tracking-tight"
          >
            {worldName ? `${worldName} - ` : ""}World Builder
          </h1>
          <p
            data-testid="caption-world-builder"
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Build lore, bring characters to life, and define the continuity of your world.
          </p>

          <div className="p-12 border-2 border-dashed rounded-none bg-muted/20 text-muted-foreground flex items-center justify-center mt-12 min-h-[400px]">
            <Button onClick={handleAddFirstAsset}>Add First Asset (Test)</Button>
          </div>
        </div>
        <CreateWorldModal
          isOpen={isCreateModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onWorldCreated={handleWorldCreated}
        />
      </div>
    </>
  );
};
