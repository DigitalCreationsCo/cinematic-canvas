import { useEffect, useMemo, useState } from 'react';
import type { Character, Scene } from '../../../../shared/types/workflow.types.js';
import type { EditableSceneFields } from '../../../../shared/types/editable.types.js';
import { motion } from 'framer-motion';
import { useAssetStore, useSceneAssets } from '#client/store/useAssetStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { resolvePublicUrl } from '#shared/utils/utils.js';
import { VideoPlayer } from '#client/components/ui/video-player.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { Button } from '#client/components/ui/button.js';
import { getBestAsset } from '#shared/utils/assets.utils.js';

export interface SceneEditorProps {
    scene: Scene;
    characters: Map<string, Character>;
    onClose: () => void;
    onSave: (updates: EditableSceneFields) => Promise<void>;
    setIsSaving: (v: boolean) => void;
}

export function SceneEditor({ scene, characters, onClose, onSave, setIsSaving }: SceneEditorProps) {

    const locations = useProjectStore(s => s.locations);
    const scenes = useProjectStore(s => s.scenes);

    const setEditingSceneId = useCanvasUIStore(s => s.setEditingSceneId);
    const [name, setName] = useState(scene.name || '');
    const [description, setDescription] = useState(scene.description || '');
    const [mood, setMood] = useState(scene.mood || '');
    const [continuityNotes, setContinuityNotes] = useState(
        scene.continuityNotes?.join('\n') || ''
    );

    const assets = useAssetStore((s) => s.assets);
    const sceneAssets = useSceneAssets(scene.id);

    const allSceneAssets = useMemo(() => {
        const scenesList = Array.from(scenes.values());
        if (!scenesList.length) return undefined;
        return scenesList.map(s => assets.get(s.id));
    }, [scenes, assets]);

    const characterIds = scene.characterIds || [];
    const charactersInScene = useMemo(() => characterIds.map(id => characters.get(id)).filter(c => c !== undefined), [characterIds]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSave({
                name,
                description,
                mood,
                continuityNotes: continuityNotes.split('\n').filter(n => n.trim() !== '')
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ backgroundColor: "rgba(0, 0, 0, 0)" }}
            animate={{
                backgroundColor: "rgba(0, 0, 0, 0.97)",
            }}
            exit={{
                backgroundColor: "rgba(0, 0, 0, 0)",
                transition: { delay: .25 }
            }}
            transition={{
                ease: [0.1, 0.2, 0.2, 0.5],
            }}
            className="fixed h-[calc(100%-40px)] w-full z-[100] flex flex-col items-center justify-center pointer-events-none"
        >
            <motion.div
                initial={{ opacity: 0 }}
                animate={{
                    opacity: 1,
                    transition: { delay: .35 }
                }}
                exit={{
                    opacity: 0,
                }}
                className="w-full h-full editor-root z-[100] flex flex-col items-center justify-center pointer-events-auto backdrop-blur-sm "
            >
                <div className="workspace-preview flex flex-col flex-1 w-full">
                    <div className="workspace-titlebar">
                        <span className="ws-title">{(scene.sceneIndex + 1).toString().padStart(3, '0')}: {scene.name}</span>
                    </div>
                    <div className="workspace-body h-full w-full">
                        <div className="ws-sidebar">
                            <div className="ws-sidebar-label">Scenes</div>
                            {Array.from(scenes.values()).map((scene, i) => (
                                <Button variant="ghost" className="flex w-full ws-scene-item" onClick={() => setEditingSceneId(scene.id)}>
                                    <div className="ws-scene-thumb" style={{
                                        background: `url(${resolvePublicUrl(getBestAsset(allSceneAssets?.[i], 'scene_start_frame')?.data)}`,
                                        objectFit: 'contain'
                                    }}></div>
                                    <span className="ws-scene-label mr-auto">{scene.name} — {locations.get(scene.locationId)?.name}
                                    </span>
                                </Button>
                            ))}

                            {/* <div className="ws-sidebar-label">Characters</div> */}
                            {/* {Array.from(characters.values()).map((character) =>
                                <div className="ws-scene-item">
                                    <div className="ws-char-avatar" style={{ width: "28px", height: "18px", borderRadius: "2px" }}>M</div>
                                    <span className="ws-scene-label">MAYA (Protagonist)</span>
                                </div>
                            )}
                            <div className="ws-scene-item">
                                <div className="ws-char-avatar" style={{ width: "28px", height: "18px", borderRadius: "2px" }}>E</div>
                                <span className="ws-scene-label">ECHO (Antagonist)</span>
                            </div> */}
                        </div>

                        <div className="ws-main">
                            <div className="ws-canvas-area">
                                <div className="ws-canvas-bg"></div>
                                <div className="ws-beam"></div>
                                <div className="ws-frame">
                                    {sceneAssets['bestAssets']['scene_video']?.data ?
                                        <VideoPlayer src={resolvePublicUrl(sceneAssets['bestAssets']['scene_video']?.data)}
                                            className='h-full w-full' />
                                        : <div className="ws-frame-content">
                                            <div className="ws-frame-figure">
                                                <div className="ws-silhouette">
                                                </div>
                                            </div>
                                        </div>
                                    }
                                </div>
                            </div>
                            <div className="ws-timeline">
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <span className="ws-timeline-label">VISUAL</span>
                                    <div className="ws-timeline-track" style={{ flex: "1", position: "relative", height: "16px" }}>
                                        <div className="ws-clip" style={{ left: "0%", width: "18%", background: "rgba(139,32,32,0.35)", border: "1px solid rgba(139,32,32,0.5)" }}><span>Ext. Establish</span></div>
                                        <div className="ws-clip" style={{ left: "19%", width: "32%", background: "rgba(26,58,92,0.35)", border: "1px solid rgba(26,58,92,0.5)" }}><span>Rooftop Chase</span></div>
                                        <div className="ws-clip" style={{ left: "52%", width: "28%", background: "rgba(201,165,90,0.2)", border: "1px solid rgba(201,165,90,0.4)" }}><span>Confrontation</span></div>
                                        <div className="ws-clip" style={{ left: "81%", width: "18%", background: "rgba(139,32,32,0.35)", border: "1px solid rgba(139,32,32,0.5)" }}><span>Cutaway</span></div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <span className="ws-timeline-label">AUDIO</span>
                                    <div className="ws-timeline-track" style={{ flex: "1", position: "relative", height: "16px" }}>
                                        <div className="ws-clip" style={{ left: "0%", width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}><span>Ambient City / Score Layer</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="ws-panel">
                            <div className="ws-panel-section">
                                <div className="ws-scene-overlay-text">
                                    <p className="ws-panel-title">
                                        {(scene.sceneIndex + 1).toString().padStart(3, '0')}: {scene.name}<br />
                                        — {locations.get(scene.locationId)?.name}<br />
                                        - {locations.get(scene.locationId)?.timeOfDay}<br />
                                    </p>
                                    <div className="ws-ai-output card-cinematic-glass" style={{ marginTop: "8px" }}>
                                        {sceneAssets['bestAssets']['description']?.data}
                                    </div>
                                </div>
                                <div className="ws-panel-title"></div>
                                <div className="ws-ai-prompt card-cinematic-glass">
                                    <div className="ws-panel-title">▸ Scene Prompt</div>
                                    {sceneAssets['bestAssets']['scene_video']?.metadata.prompt || "No prompt recorded yet."}
                                </div>
                            </div>
                            <div className="ws-panel-section">
                                <div className="ws-panel-title">Characters Present</div>
                                <div className="">
                                    {charactersInScene.map(char => (
                                        <div className="ws-char-item">
                                            <div className="ws-char-avatar">{char.name.charAt(0)}</div>
                                            <div className="ws-char-info">
                                                <div className="ws-char-name">{char.name}</div>
                                                <div className="ws-char-role">{char.aliases.join(', ')}</div>
                                                <div className="ws-emotion-bar">{char?.state.emotionalState}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="ws-panel-section">
                                <div className="ws-panel-title">Scene Notes</div>
                                <div className="ws-ai-output card-cinematic-glass" style={{ fontSize: ".65rem", lineHeight: "1.7" }}>
                                    {/* ◆ Key revelation scene<br />
                                    ◆ Echo's motivation hidden until Act III<br />
                                    ◆ Pay off rain motif from Act I */}
                                    {scene.continuityNotes.map(note => `◆ ${note}\n`).join('') || "No scene notes"}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
