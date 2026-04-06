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
import { useMentionEditor } from "../hooks/useMentionEditor.js";
import { EditorContent } from "../hooks/useMentionEditor.js";

interface RegenerateSceneDialogProps {
    scene: Scene;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (prompt: string) => void;
    projectId?: string;
    enableMentions?: boolean;
}

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
    const [prompt, setPrompt] = useState(assets['scene_video']?.metadata.prompt || "");

    useEffect(() => {
        if (isOpen) {
            setPrompt(assets['scene_video']?.metadata.prompt || "");
        }
    }, [scene, isOpen]);

    const handleSubmit = async () => {
        let finalPrompt = prompt;
        
        if (enableMentions && editor) {
            finalPrompt = await editor.getHTML();
        }
        
        onSubmit(finalPrompt);
        onOpenChange(false);
    };

    const { editor, hydrateContent, isLoading: isHydrating } = useMentionEditor({
        projectId: effectiveProjectId,
        initialContent: prompt,
        onUpdate: (html) => setPrompt(html),
        placeholder: 'Enter a new prompt for the scene... Use @ to mention entities',
        editable: true,
    });

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="border max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="uppercase font-medium font-mono">Generate video {(scene.sceneIndex + 1).toString().padStart(3, '0')}: {scene.name}</DialogTitle>
                </DialogHeader>
                <label className=" text-muted-foreground font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Prompt
                    {enableMentions && <span className="text-xs ml-2 text-muted-foreground">(Type @ to mention entities)</span>}
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
                        placeholder="Enter a new prompt for the scene..."
                    />
                )}
                
                <p className=" text-muted-foreground">
                    Modify the prompt to guide the regeneration.
                    Note: If you want to exclude a specific frame (Start/End) from the generation context,
                    delete it from the preview first.
                </p>
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
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={() => { confirm('Are you sure you want to generate this scene?') && handleSubmit(); }}>
                            Generate
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
