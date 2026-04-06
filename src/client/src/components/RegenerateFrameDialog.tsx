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
import { useMentionEditor } from "../hooks/useMentionEditor.js";
import { EditorContent } from "../hooks/useMentionEditor.js";

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

    const handleSubmit = async () => {
        let finalPrompt = prompt;
        
        if (enableMentions && editor) {
            finalPrompt = await editor.getHTML();
        }
        
        onSubmit(finalPrompt, originalPrompt);
        onOpenChange();
    };

    const { editor, hydrateContent, isLoading: isHydrating } = useMentionEditor({
        projectId: effectiveProjectId,
        initialContent: prompt,
        onUpdate: (html) => setPrompt(html),
        placeholder: 'Enter a new prompt for the frame... Use @ to mention entities',
        editable: true,
    });

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
                    {enableMentions && <span className="text-xs ml-2 text-muted-foreground">(Type @ to mention characters, locations, or props)</span>}
                </label>
                
                {enableMentions && editor ? (
                    <div className="flex-1 overflow-hidden border rounded-md">
                        <EditorContent 
                            editor={editor} 
                            className="mention-editor-container prose prose-sm max-w-none p-4 overflow-y-auto"
                            style={{ minHeight: '300px' }}
                        />
                    </div>
                ) : (
                    <Textarea
                        value={prompt}
                        rows={22}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter a new prompt for the frame..."
                    />
                )}
                
                <DialogFooter className="flex items-center justify-between">
                    <div className="flex gap-2">
                        {enableMentions && editor && (
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={async () => {
                                    const hydrated = await hydrateContent();
                                    setPrompt(hydrated);
                                }}
                                disabled={isHydrating}
                            >
                                {isHydrating ? 'Hydrating...' : 'Hydrate for LLM'}
                            </Button>
                        )}
                    </div>
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