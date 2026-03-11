import React from 'react';
import { useShallow } from 'zustand/shallow';
import { ScrollArea } from '#/components/ui/scroll-area.js';
import { Label } from '#/components/ui/label.js';
import { Textarea } from '#/components/ui/textarea.js';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '#/components/ui/select.js';
import { Slider } from '#/components/ui/slider.js';
import { Switch } from '#/components/ui/switch.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs.js';
import { Settings2, Camera, Wand2, Type, MousePointer } from 'lucide-react';
import { Button } from '#/components/ui/button.js';

import { useCanvasUIStore } from '#/store/useCanvasUIStore.js';
import { useNodeStore } from '#/store/useNodeStore.js';

export function PropertiesPanel() {
    // ── Selection ──────────────────────────────────────────────────────────────
    // selectedNodeId is the single source of truth in useCanvasUIStore.
    // Reading it here (not from useNodeStore) keeps the two stores' concerns
    // clean: structural canvas state vs. transient UI state.
    const selectedNodeId = useCanvasUIStore((s) => s.selectedNodeId);

    // ── Node data ──────────────────────────────────────────────────────────────
    // Resolve the node from useNodeStore by ID. useShallow on the full nodes
    // array would re-render on every node-array mutation; instead we use a
    // fine-grained selector that re-renders only when *this* node's data changes.
    const nodeData = useNodeStore(
        (s) => {
            const node = s.nodes.find((n) => n.id === selectedNodeId);
            return node?.data as any ?? null;
        }
    );

    // Derived display values with safe fallbacks.
    const selectedLabel = nodeData?.label ?? selectedNodeId ?? 'NONE';
    const selectedStatus = (nodeData?.status ?? '').toUpperCase();
    const defaultPrompt = nodeData?.description ?? '';
    const defaultProgress = nodeData?.progress ?? 0;

    return (
        <div className="flex flex-col h-full bg-card/50">
            {/* ── Header ── */ }
            <div className="p-3 border-b border-border shrink-0">
                <h2 className="text-xs font-mono font-bold tracking-wider flex items-center gap-2">
                    <Settings2 size={ 14 } />
                    PROPERTIES
                </h2>
                <div className="mt-2 text-[10px] text-muted-foreground font-mono truncate">
                    { selectedNodeId ? (
                        <>
                            SELECTED:{ ' ' }
                            <span className="text-foreground font-semibold">{ selectedLabel }</span>
                            { selectedStatus && (
                                <span className="ml-1 opacity-60">({ selectedStatus })</span>
                            ) }
                        </>
                    ) : (
                        <span className="opacity-50 flex items-center gap-1.5">
                            <MousePointer size={ 10 } />
                            CLICK A NODE TO INSPECT
                        </span>
                    ) }
                </div>
            </div>

            {/* ── Empty state ── */ }
            { !selectedNodeId ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
                        <MousePointer size={ 16 } className="text-muted-foreground opacity-40" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-xs font-mono font-semibold text-foreground/40 uppercase">
                            No Selection
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug max-w-[160px]">
                            Click any node on the canvas to view and edit its properties.
                        </span>
                    </div>
                </div>
            ) : (
                /* ── Inspector Tabs ── */
                <Tabs defaultValue="prompt" className="flex-1 flex flex-col">
                    <div className="px-3 pt-2">
                        <TabsList className="w-full h-8 bg-muted/50 grid grid-cols-3">
                            <TabsTrigger value="prompt" className="text-[10px] font-mono h-6 data-[state=active]:bg-background">
                                <Type size={ 12 } className="mr-1" />PROMPT
                            </TabsTrigger>
                            <TabsTrigger value="camera" className="text-[10px] font-mono h-6 data-[state=active]:bg-background">
                                <Camera size={ 12 } className="mr-1" />CAMERA
                            </TabsTrigger>
                            <TabsTrigger value="settings" className="text-[10px] font-mono h-6 data-[state=active]:bg-background">
                                <Wand2 size={ 12 } className="mr-1" />GEN
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-6">

                            {/* ── Prompt Tab ── */ }
                            <TabsContent value="prompt" className="m-0 space-y-4">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">
                                        Base Prompt
                                    </Label>
                                    {/* key resets the uncontrolled textarea when selection changes */ }
                                    <Textarea
                                        key={ selectedNodeId }
                                        className="min-h-[100px] text-xs font-sans resize-none bg-background focus-visible:ring-primary/50"
                                        defaultValue={ defaultPrompt }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">
                                        Negative Prompt
                                    </Label>
                                    <Textarea
                                        className="min-h-[60px] text-xs font-sans resize-none bg-background focus-visible:ring-primary/50"
                                        placeholder="blur, distortion, low quality, bad anatomy..."
                                    />
                                </div>

                                <Button variant="secondary" className="w-full h-8 text-xs font-mono">
                                    ENHANCE PROMPT
                                </Button>

                                {/* Live progress readout when this node is generating */ }
                                { nodeData?.status === 'generating' && (
                                    <div className="space-y-1.5 border-t border-border pt-3">
                                        <div className="flex justify-between text-[10px] font-mono">
                                            <span className="text-muted-foreground uppercase">Progress</span>
                                            <span className="text-primary font-bold">{ defaultProgress }%</span>
                                        </div>
                                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all duration-500"
                                                style={ { width: `${defaultProgress}%` } }
                                            />
                                        </div>
                                    </div>
                                ) }
                            </TabsContent>

                            {/* ── Camera Tab ── */ }
                            <TabsContent value="camera" className="m-0 space-y-5">
                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">Shot Type</Label>
                                    <Select defaultValue="close-up">
                                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="wide">Wide Shot</SelectItem>
                                            <SelectItem value="medium">Medium Shot</SelectItem>
                                            <SelectItem value="close-up">Close-Up</SelectItem>
                                            <SelectItem value="macro">Extreme Close-Up</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">Camera Movement</Label>
                                    <Select defaultValue="static">
                                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="static">Static</SelectItem>
                                            <SelectItem value="pan-left">Pan Left</SelectItem>
                                            <SelectItem value="pan-right">Pan Right</SelectItem>
                                            <SelectItem value="push-in">Push In</SelectItem>
                                            <SelectItem value="pull-out">Pull Out</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">Transition (Out)</Label>
                                    <Select defaultValue="cut">
                                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cut">Hard Cut</SelectItem>
                                            <SelectItem value="dissolve">Dissolve</SelectItem>
                                            <SelectItem value="fade">Fade to Black</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </TabsContent>

                            {/* ── Gen Settings Tab ── */ }
                            <TabsContent value="settings" className="m-0 space-y-5">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-mono text-muted-foreground uppercase">Guidance Scale</Label>
                                        <span className="text-[10px] font-mono text-primary">7.5</span>
                                    </div>
                                    <Slider defaultValue={ [ 7.5 ] } max={ 20 } step={ 0.1 } className="py-2" />
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-[10px] font-mono text-muted-foreground uppercase">Duration (Seconds)</Label>
                                        <span className="text-[10px] font-mono text-primary">6s</span>
                                    </div>
                                    <Slider defaultValue={ [ 6 ] } max={ 10 } min={ 1 } step={ 1 } className="py-2" />
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t border-border">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">High Fidelity Render</Label>
                                    <Switch />
                                </div>

                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] font-mono text-muted-foreground uppercase">Allow Person Gen</Label>
                                    <Switch defaultChecked />
                                </div>
                            </TabsContent>

                        </div>
                    </ScrollArea>

                    <div className="p-3 border-t border-border bg-muted/20 shrink-0">
                        <Button className="w-full font-mono text-xs h-8">APPLY CHANGES</Button>
                    </div>
                </Tabs>
            ) }
        </div>
    );
}