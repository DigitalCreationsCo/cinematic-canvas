import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "#/components/ui/dialog.js";
import { Button } from "#/components/ui/button.js";
import { Textarea } from "#/components/ui/textarea.js";
import { useEffect, useState } from "react";
import { AssetKey, AssetVersion, Scene } from "../../../shared/types/index.js";
import { useSceneAssets } from "#/store/useAssetStore.js";

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
    const [ assets, setAssets ] = useState<Partial<Record<AssetKey, AssetVersion | undefined>>>(bestAssets);

    useEffect(() => {
        setAssets(bestAssets);
    }, [ bestAssets ]);

    const originalPrompt = (frameToRegenerate === "start"
        ? assets?.[ 'start_frame_prompt' ]?.data
        : assets?.[ 'end_frame_prompt' ]?.data) || "";

    const [ prompt, setPrompt ] = useState(originalPrompt);

    useEffect(() => {
        setPrompt((frameToRegenerate === "start"
            ? assets?.[ 'start_frame_prompt' ]?.data
            : assets?.[ 'end_frame_prompt' ]?.data) || "");
    }, [ scene, frameToRegenerate, isOpen, onOpenChange, onSubmit ]);

    const handleSubmit = () => {
        onSubmit(prompt, originalPrompt);
        onOpenChange();
    };

    return (
        <Dialog open={ isOpen } onOpenChange={ onOpenChange }>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="capitalize">{ `Generate ${frameToRegenerate} Frame (Scene ${scene.sceneIndex + 1})` }</DialogTitle>
                </DialogHeader>
                <label className=" font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Prompt
                </label>
                <Textarea
                    value={ prompt }
                    rows={ 10 }
                    onChange={ (e) => setPrompt(e.target.value) }
                    placeholder="Enter a new prompt for the frame..."
                />
                <DialogFooter>
                    <Button variant="ghost" onClick={ onOpenChange }>
                        Cancel
                    </Button>
                    <Button onClick={ () => { confirm('Are you sure?') && handleSubmit(); } }>Generate</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}