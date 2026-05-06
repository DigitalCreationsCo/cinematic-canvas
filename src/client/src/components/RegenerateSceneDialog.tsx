// RegenerateSceneDialog.tsx

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '#client/components/ui/dialog.js';
import { Button } from '#client/components/ui/button.js';
import { Textarea } from '#client/components/ui/textarea.js';
import { useEffect, useRef, useState } from 'react';
import type { Scene } from "../../../shared/types/workflow.types.js";
import { useSceneAssets } from '#client/store/useAssetStore.js';
import {
    MentionTextarea,
    type MentionTextareaHandle,
} from '../components/editor/mention//MentionTextArea.js';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RegenerateSceneDialogProps {
    scene: Scene;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    /** Receives the prompt HTML. Mention chips are preserved for server-side KBHydration. */
    onSubmit: (prompt: string) => void;
    projectId?: string;
    enableMentions?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RegenerateSceneDialog({
    scene,
    isOpen,
    onOpenChange,
    onSubmit,
    projectId: providedProjectId,
    enableMentions = true,
}: RegenerateSceneDialogProps) {
    const effectiveProjectId = providedProjectId ?? scene.projectId;
    const { bestAssets: assets } = useSceneAssets(scene.id);

    const mentionRef = useRef<MentionTextareaHandle>(null);

    // Plain-text prompt mirrors editor content; used when mentions are disabled
    // and as a fallback if the ref is somehow unavailable at submit time.
    const [prompt, setPrompt] = useState(
        () => assets['scene_video']?.metadata.prompt ?? ''
    );

    // Reset editor content whenever the dialog opens (potentially for a different scene)
    useEffect(() => {
        if (!isOpen) return;
        const fresh = assets['scene_video']?.metadata.prompt ?? '';
        setPrompt(fresh);
        mentionRef.current?.setValue(fresh);
    }, [isOpen, scene.id]); // scene.id guards against stale content on scene switch

    const handleSubmit = () => {
        // getValue() returns serialized HTML with mention chip spans intact.
        // The server's KBHydrator replaces them with structured entity knowledge.
        const finalPrompt = enableMentions
            ? (mentionRef.current?.getValue() ?? prompt)
            : prompt;

        onSubmit(finalPrompt);
        onOpenChange(false);
    };

    const handleConfirmAndSubmit = () => {
        if (confirm('Are you sure you want to generate this scene?')) handleSubmit();
    };

    const sceneLabel = `${(scene.sceneIndex + 1).toString().padStart(3, '0')}: ${scene.name}`;

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="border max-w-4xl max-h-[90vh] flex flex-col gap-4">
                <DialogHeader>
                    <DialogTitle className="uppercase font-medium font-mono">
                        Generate video {sceneLabel}
                    </DialogTitle>
                </DialogHeader>

                <label className="text-muted-foreground font-medium leading-none">
                    Prompt
                    {enableMentions && (
                        <span className="text-xs ml-2 text-muted-foreground">
                            (Type @ to mention a character, location, or prop)
                        </span>
                    )}
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

                <p className="text-sm text-muted-foreground">
                    Enter a prompt to guide video generation. To exclude a Start/End frame
                    from the generation context, remove it from the scene first.
                </p>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleConfirmAndSubmit}>Generate</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}