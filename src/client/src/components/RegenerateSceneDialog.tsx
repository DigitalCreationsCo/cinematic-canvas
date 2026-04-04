import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Textarea } from "#client/components/ui/textarea.js";
import { useEffect, useState } from "react";
import { Scene } from "../../../shared/types/index.js";
import { useSceneAssets } from "#client/store/useAssetStore.js";

interface RegenerateSceneDialogProps {
    scene: Scene;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (prompt: string) => void;
}

export function RegenerateSceneDialog({
    scene,
    isOpen,
    onOpenChange,
    onSubmit,
}: RegenerateSceneDialogProps) {

    const { bestAssets: assets } = useSceneAssets(scene.id);
    const [prompt, setPrompt] = useState(assets['scene_video']?.metadata.prompt || "");

    useEffect(() => {
        if (isOpen) {
            setPrompt(assets['scene_video']?.metadata.prompt || "");
        }
    }, [scene, isOpen]);

    const handleSubmit = () => {
        onSubmit(prompt);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="border max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="uppercase font-medium font-mono">Generate video {(scene.sceneIndex + 1).toString().padStart(3, '0')}: {scene.name}</DialogTitle>
                </DialogHeader>
                <label className=" text-muted-foreground font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Prompt
                </label>
                <Textarea
                    value={prompt}
                    rows={22}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a new prompt for the scene..."
                />
                <p className=" text-muted-foreground">
                    Modify the prompt to guide the regeneration.
                    Note: If you want to exclude a specific frame (Start/End) from the generation context,
                    delete it from the preview first.
                </p>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => { confirm('Are you sure you want to generate this scene?') && handleSubmit(); }}>
                        Generate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
