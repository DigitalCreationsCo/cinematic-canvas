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
import { AssetKey, AssetVersion, Scene } from "../../../shared/types/index.js";
import { useSceneAssets } from "#client/store/useAssetStore.js";

interface RegenerateFrameDialogProps {
    scene: Scene;
    frameToRegenerate: "start" | "end" | null;
    isOpen: boolean;
    onOpenChange: () => void;
    onSubmit: (prompt: string, originalPrompt: string) => void;
    originalPrompt?: string;
}

export function RegenerateFrameDialog({
    scene,
    frameToRegenerate,
    isOpen,
    onOpenChange,
    onSubmit,
}: RegenerateFrameDialogProps) {

    const { bestAssets } = useSceneAssets(scene.id);
    const [assets, setAssets] = useState<Partial<Record<AssetKey, AssetVersion | undefined>>>(bestAssets);

    useEffect(() => {
        setAssets(bestAssets);
    }, [bestAssets]);

    const originalPrompt = (frameToRegenerate === "start"
        ? assets?.['scene_start_frame']?.metadata?.prompt
        : assets?.['scene_end_frame']?.metadata?.prompt) || "";

    const [prompt, setPrompt] = useState(originalPrompt);

    useEffect(() => {
        setPrompt((frameToRegenerate === "start"
            ? assets?.['scene_start_frame']?.metadata?.prompt
            : assets?.['scene_end_frame']?.metadata?.prompt) || "");
    }, [scene, frameToRegenerate, isOpen, onOpenChange, onSubmit]);

    const handleSubmit = () => {
        onSubmit(prompt, originalPrompt);
        onOpenChange();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="border">
                <DialogHeader>
                    <DialogTitle className="text-muted-foreground font-medium uppercase font-mono ">
                        {`Generate ${frameToRegenerate} Frame`} {(scene.sceneIndex + 1).toString().padStart(3, '0')}: {scene.name}
                    </DialogTitle>
                </DialogHeader>
                <label className=" text-muted-foreground font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Prompt
                </label>
                <Textarea
                    value={prompt}
                    rows={22}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a new prompt for the frame..."
                />
                <DialogFooter>
                    <Button variant="ghost" onClick={onOpenChange}>
                        Cancel
                    </Button>
                    <Button onClick={() => { confirm('Are you sure?') && handleSubmit(); }}>Generate</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}