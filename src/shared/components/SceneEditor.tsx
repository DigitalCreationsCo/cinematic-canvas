import { useEffect, useMemo, useState } from 'react';
import type { Character, Scene } from '../types/workflow.types.js';
import type { EditableSceneFields } from '../types/editable.types.js';
import { motion } from 'framer-motion';

export interface SceneEditorProps {
    scene: Scene;
    characters: Map<string, Character>;
    onClose: () => void;
    onSave: (updates: EditableSceneFields) => Promise<void>;
    setIsSaving: (v: boolean) => void;
}

export function SceneEditor({ scene, characters, onClose, onSave, setIsSaving }: SceneEditorProps) {
    const [name, setName] = useState(scene.name || '');
    const [description, setDescription] = useState(scene.description || '');
    const [mood, setMood] = useState(scene.mood || '');
    const [continuityNotes, setContinuityNotes] = useState(
        scene.continuityNotes?.join('\n') || ''
    );

    const characterIds = scene.characterIds || [];
    const charactersInScene = useMemo(() => characterIds.map(id => characters.get(id)).filter(Boolean), [characterIds]);

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
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{
                delay: 0.3,
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1]
            }}
            className="w-full h-full editor-root absolute overflow-hidden inset-0 z-[100] flex flex-col items-center justify-center bg-background/10 backdrop-blur-sm animate-in fade-in fade-out animate-out">
            <div className="workspace-preview flex flex-col flex-1 w-full">
                <div className="workspace-titlebar">
                    <span className="ws-title">{scene.sceneIndex.toString().padStart(3, '0')}: {scene.name}</span>
                </div>
                <div className="workspace-body h-full w-full">
                    <div className="ws-sidebar">
                        <div className="ws-sidebar-label">Scenes</div>
                        <div className="ws-scene-item">
                            <div className="ws-scene-thumb"></div>
                            <span className="ws-scene-label">INT. Precinct — Night</span>
                        </div>
                        <div className="ws-scene-item active">
                            <div className="ws-scene-thumb"></div>
                            <span className="ws-scene-label">EXT. Rooftop — Dusk</span>
                        </div>
                        <div className="ws-scene-item">
                            <div className="ws-scene-thumb"></div>
                            <span className="ws-scene-label">INT. Safehouse — Dawn</span>
                        </div>
                        <div className="ws-scene-item">
                            <div className="ws-scene-thumb"></div>
                            <span className="ws-scene-label">EXT. Harbor — Rain</span>
                        </div>
                        <div className="ws-sidebar-label">Characters</div>
                        <div className="ws-scene-item">
                            <div className="ws-char-avatar" style={{ width: "28px", height: "18px", borderRadius: "2px" }}>M</div>
                            <span className="ws-scene-label">MAYA (Protagonist)</span>
                        </div>
                        <div className="ws-scene-item">
                            <div className="ws-char-avatar" style={{ width: "28px", height: "18px", borderRadius: "2px" }}>E</div>
                            <span className="ws-scene-label">ECHO (Antagonist)</span>
                        </div>
                    </div>

                    <div className="ws-main">
                        <div className="ws-canvas-area">
                            <div className="ws-canvas-bg"></div>
                            <div className="ws-beam"></div>
                            <div className="ws-frame">
                                <div className="ws-frame-content">
                                    <div className="ws-frame-figure">
                                        <div className="ws-silhouette"></div>
                                    </div>
                                    <div className="ws-scene-overlay-text">
                                        <p className="ws-scene-location">EXT. ROOFTOP — DUSK — SCENE 14</p>
                                        <p className="ws-scene-dialogue">"The city remembers everyone it swallows."</p>
                                    </div>
                                </div>
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
                            <div className="ws-panel-title">AI Co-writer</div>
                            <div className="ws-ai-prompt">
                                <div className="prompt-label">▸ Scene Prompt</div>
                                Maya confronts Echo on the rooftop. Tension, subtext about betrayal, cinematic.
                            </div>
                            <div className="ws-ai-output" style={{ marginTop: "8px" }}>
                                Maya steps onto the gravel. Echo doesn't turn around. Below them, the city hums its indifference.<br /><br />
                                <strong style={{ color: "var(--color-warm)" }}>MAYA</strong><br />
                                You knew the whole time.<br /><br />
                                Echo exhales smoke.<span className="cursor-blink"></span>
                            </div>
                        </div>
                        <div className="ws-panel-section">
                            <div className="ws-panel-title">Characters Present</div>
                            <div className="ws-char-item">
                                <div className="ws-char-avatar">M</div>
                                <div className="ws-char-info">
                                    <div className="ws-char-name">Maya Chen</div>
                                    <div className="ws-char-role">Detective · Protagonist</div>
                                    <div className="ws-emotion-bar"><div className="ws-emotion-fill" style={{ width: "72%" }}></div></div>
                                </div>
                            </div>
                            <div className="ws-char-item">
                                <div className="ws-char-avatar">E</div>
                                <div className="ws-char-info">
                                    <div className="ws-char-name">Echo</div>
                                    <div className="ws-char-role">Informant · Antagonist</div>
                                    <div className="ws-emotion-bar"><div className="ws-emotion-fill" style={{ width: "44%", background: "var(--color-accent-red)" }}></div></div>
                                </div>
                            </div>
                        </div>
                        <div className="ws-panel-section">
                            <div className="ws-panel-title">Scene Notes</div>
                            <div className="ws-ai-output" style={{ fontSize: ".65rem", lineHeight: "1.7" }}>
                                ◆ Key revelation scene<br />
                                ◆ Echo's motivation hidden until Act III<br />
                                ◆ Pay off rain motif from Act I
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
