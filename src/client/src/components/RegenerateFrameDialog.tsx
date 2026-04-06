import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import { Textarea } from "#client/components/ui/textarea.js";
import { useEffect, useRef, useState } from "react";
import { AssetKey, AssetVersion, Scene } from "../../../shared/types/index.js";
import { useSceneAssets } from "#client/store/useAssetStore.js";
import {
    MentionTextarea,
    type MentionTextareaHandle,
} from '../components/editor/mention//MentionTextArea.js';

interface RegenerateFrameDialogProps {
    scene: Scene;
    frameToRegenerate: "start" | "end" | null;
    isOpen: boolean;
    onOpenChange: () => void;
    onSubmit: (prompt: string, originalPrompt: string) => void;
    originalPrompt?: string;
    projectId?: string;
    enableMentions?: boolean;
}

export function RegenerateFrameDialog({
    scene,
    frameToRegenerate,
    isOpen,
    onOpenChange,
    onSubmit,
    projectId: providedProjectId,
    enableMentions = true,
}: RegenerateFrameDialogProps) {
    const effectiveProjectId = providedProjectId ?? scene.projectId;

    const { bestAssets } = useSceneAssets(scene.id);
    const [assets, setAssets] = useState<Partial<Record<AssetKey, AssetVersion | undefined>>>(bestAssets);

    const mentionRef = useRef<MentionTextareaHandle>(null);

    useEffect(() => {
        setAssets(bestAssets);
    }, [bestAssets]);

    const originalPrompt = (frameToRegenerate === "start"
        ? assets?.['scene_start_frame']?.metadata?.prompt
        : assets?.['scene_end_frame']?.metadata?.prompt) || "";

    const [prompt, setPrompt] = useState(originalPrompt);

    useEffect(() => {
        if (!isOpen) return;

        const fresh = (frameToRegenerate === "start"
            ? assets?.['scene_start_frame']?.metadata?.prompt
            : assets?.['scene_end_frame']?.metadata?.prompt) || "";
        setPrompt(fresh);
        mentionRef.current?.setValue(fresh);

    }, [scene, frameToRegenerate, isOpen, onOpenChange, onSubmit]);

    const handleSubmit = async () => {
        const finalPrompt = enableMentions ? mentionRef.current?.getValue() ?? prompt : prompt;

        onSubmit(finalPrompt, originalPrompt);
        onOpenChange();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="border max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="text-muted-foreground font-medium uppercase font-mono ">
                        {`Generate ${frameToRegenerate} Frame`} {(scene.sceneIndex + 1).toString().padStart(3, '0')}: {scene.name}
                    </DialogTitle>
                </DialogHeader>
                <label className=" text-muted-foreground font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Prompt
                    {enableMentions && <span className="text-xs ml-2 text-muted-foreground">(Type @ to mention a character, location, or prop)</span>}
                </label>

                {enableMentions ? (
                    <MentionTextarea
                        ref={mentionRef}
                        projectId={effectiveProjectId}
                        initialContent={prompt}
                        onUpdate={setPrompt}
                        placeholder="Enter a prompt for the scene… Use @ to mention entities"
                        rows={22}
                        className="flex-1"
                    />
                ) : (
                    <Textarea
                        value={prompt}
                        rows={22}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter a new prompt for the scene…"
                    />
                )}

                <DialogFooter className="flex items-center justify-between">
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onOpenChange}>
                            Cancel
                        </Button>
                        <Button onClick={() => { confirm('Are you sure?') && handleSubmit(); }}>
                            Generate
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}