import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Input } from "#client/components/ui/input.js";
import { Textarea } from "#client/components/ui/textarea.js";
import { Label } from "#client/components/ui/label.js";
import { api } from "#client/lib/api.js";
import { useAuth } from "../../lib/auth-context.js";
import { World } from "../../../../shared/types/index.js";
import { Loader } from '#client/components/Loader.js';

interface CreateWorldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWorldCreated: (world: World) => void;
}

export const CreateWorldModal: React.FC<CreateWorldModalProps> = ({ isOpen, onClose, onWorldCreated }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { activeTeamId } = useAuth();

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("World name is required.");
      return;
    }
    if (!activeTeamId) {
      setError("No active team selected.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const world = await api.worlds.create.mutate({
        name,
        description,
      });
      onWorldCreated(world);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create world.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Your New World</DialogTitle>
          <DialogDescription>
            Give your world a name and description to save it. This is required before you can add assets.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="world-name">World Name</Label>
            <Input
              id="world-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Cyberpunk City"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="world-description">Description (optional)</Label>
            <Textarea
              id="world-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A neon-drenched dystopian metropolis in 2077..."
            />
          </div>
        </div>
        {error && <div className="text-destructive text-sm">{error}</div>}
        <Button onClick={handleCreate} disabled={isLoading}>
          {isLoading && <Loader />}
          Save World
        </Button>
      </DialogContent>
    </Dialog>
  );
};
