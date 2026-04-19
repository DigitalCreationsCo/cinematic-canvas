import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    User,
    MapPin,
    Palette,
    Image as ImageIcon,
    Package,
    BookOpen,
    Clapperboard,
    X,
    ChevronDown,
    CheckSquare,
    Upload,
    ArrowRight,
    AlertCircle,
} from 'lucide-react';
import { cn } from '#client/lib/utils.js';
import { apiFetch, apiFetchMultipart } from '#client/lib/api.js';
import { api } from '#client/lib/routes.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { NodeFactory } from '#client/domain/canvas/NodeFactory.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImageUseType =
    | 'character'
    | 'location'
    | 'prop'
    | 'image'
// | 'style_ref'
// | 'scene_frame'
// | 'asset';

interface StagedImage {
    id: string;
    file: File;
    previewUrl: string;
    useType: ImageUseType | null;
    name: string;
    /** True if this image has been dispatched / placed */
    placed: boolean;
}

export interface BulkFilesStagingPanelProps {
    /** Files passed in from the drop event or file picker */
    files: File[];
    setStagedFiles: React.Dispatch<React.SetStateAction<File[]>>;
    projectId: string;
    onPlace: (images: PlacedImage[]) => void;
    onClose: () => void;
}

export interface PlacedImage {
    file: File;
    previewUrl: string;
    useType: ImageUseType;
    name: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const USE_TYPE_OPTIONS: {
    type: ImageUseType;
    label: string;
    shortLabel: string;
    icon: React.ElementType;
    /** Whether to show a name input for this type */
    requiresName: boolean;
    description: string;
    colorClass: string;
    activeBg: string;
    activeText: string;
    activeBorder: string;
}[] = [
        {
            type: 'character',
            label: 'Character',
            shortLabel: 'Char',
            icon: User,
            requiresName: true,
            description: 'Portrait for a new character',
            colorClass: 'text-sky-400',
            activeBg: 'bg-sky-500/15',
            activeText: 'text-sky-300',
            activeBorder: 'border-sky-500/50',
        },
        {
            type: 'location',
            label: 'Location',
            shortLabel: 'Loc',
            icon: MapPin,
            requiresName: true,
            description: 'Reference for a new location',
            colorClass: 'text-emerald-400',
            activeBg: 'bg-emerald-500/15',
            activeText: 'text-emerald-300',
            activeBorder: 'border-emerald-500/50',
        },
        {
            type: 'prop',
            label: 'Prop',
            shortLabel: 'Prop',
            icon: Package,
            requiresName: true,
            description: 'Object or prop in the scene',
            colorClass: 'text-amber-400',
            activeBg: 'bg-amber-500/15',
            activeText: 'text-amber-300',
            activeBorder: 'border-amber-500/50',
        },
        {
            type: 'image',
            label: 'Style Ref',
            shortLabel: 'Style',
            icon: Palette,
            requiresName: false,
            description: 'Visual style reference for generation',
            colorClass: 'text-purple-400',
            activeBg: 'bg-purple-500/15',
            activeText: 'text-purple-300',
            activeBorder: 'border-purple-500/50',
        },
        // {
        //     type: 'lore',
        //     label: 'Lore',
        //     shortLabel: 'Lore',
        //     icon: BookOpen,
        //     requiresName: false,
        //     description: 'World-building or moodboard reference',
        //     colorClass: 'text-rose-400',
        //     activeBg: 'bg-rose-500/15',
        //     activeText: 'text-rose-300',
        //     activeBorder: 'border-rose-500/50',
        // },
        // {
        //     type: 'scene_frame',
        //     label: 'Scene Frame',
        //     shortLabel: 'Frame',
        //     icon: Clapperboard,
        //     requiresName: false,
        //     description: 'Start or end frame for a scene',
        //     colorClass: 'text-orange-400',
        //     activeBg: 'bg-orange-500/15',
        //     activeText: 'text-orange-300',
        //     activeBorder: 'border-orange-500/50',
        // },
        // {
        //     type: 'asset',
        //     label: 'Image Asset',
        //     shortLabel: 'Asset',
        //     icon: ImageIcon,
        //     requiresName: false,
        //     description: 'Generic image node on the canvas',
        //     colorClass: 'text-slate-400',
        //     activeBg: 'bg-slate-500/15',
        //     activeText: 'text-slate-300',
        //     activeBorder: 'border-slate-500/40',
        // },
    ];

const getOptionByType = (type: ImageUseType | null) =>
    USE_TYPE_OPTIONS.find((o) => o.type === type) ?? null;

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypePill({
    option,
    selected,
    onClick,
}: {
    option: (typeof USE_TYPE_OPTIONS)[number];
    selected: boolean;
    onClick: () => void;
}) {
    const Icon = option.icon;
    return (
        <button
            type="button"
            onClick={onClick}
            title={option.description}
            className={cn(
                'flex items-center gap-1 px-2 py-1 text-xs border transition-all duration-100 shrink-0',
                selected
                    ? `${option.activeBg} ${option.activeText} ${option.activeBorder}`
                    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            <Icon className="w-3 h-3" />
            <span>{option.shortLabel}</span>
        </button>
    );
}

function StagedImageCard({
    image,
    onSetType,
    onSetName,
    onRemove,
}: {
    image: StagedImage;
    onSetType: (id: string, type: ImageUseType) => void;
    onSetName: (id: string, name: string) => void;
    onRemove: (id: string) => void;
}) {
    const selectedOption = getOptionByType(image.useType);

    return (
        <div
            className={cn(
                'relative flex flex-col border bg-card shrink-0 w-[160px] transition-all duration-150',
                image.useType
                    ? `border-b-2 ${selectedOption?.activeBorder}`
                    : 'border-border',
            )}
        >
            {/* Thumbnail */}
            <div className="relative w-full aspect-square bg-muted overflow-hidden">
                <img
                    src={image.previewUrl}
                    alt={image.file.name}
                    className="w-full h-full object-cover"
                />
                {/* Remove button */}
                <button
                    type="button"
                    onClick={() => onRemove(image.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
                >
                    <X className="w-3 h-3 text-white" />
                </button>
                {/* Assigned type badge */}
                {selectedOption && (
                    <div
                        className={cn(
                            'absolute bottom-1 left-1 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium',
                            selectedOption.activeBg,
                            selectedOption.activeText,
                        )}
                    >
                        {React.createElement(selectedOption.icon, { className: 'w-2.5 h-2.5' })}
                        {selectedOption.shortLabel}
                    </div>
                )}
            </div>

            {/* Name input — only for entity types */}
            {selectedOption?.requiresName && (
                <div className="px-2 pt-1.5 pb-1">
                    <input
                        type="text"
                        placeholder="Name…"
                        value={image.name}
                        onChange={(e) => onSetName(image.id, e.target.value)}
                        className={cn(
                            'w-full bg-transparent border-b text-xs py-0.5 outline-none placeholder:text-muted-foreground/50',
                            'focus:border-primary transition-colors',
                            selectedOption.activeText,
                        )}
                    />
                </div>
            )}

            {/* File name */}
            <div className="px-2 pb-2 pt-1">
                <p className="text-[10px] text-muted-foreground truncate" title={image.file.name}>
                    {image.file.name}
                </p>
            </div>

            {/* Type pills */}
            <div className="px-2 pb-2 flex flex-wrap gap-1">
                {USE_TYPE_OPTIONS.map((opt) => (
                    <TypePill
                        key={opt.type}
                        option={opt}
                        selected={image.useType === opt.type}
                        onClick={() => onSetType(image.id, opt.type)}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BulkFilesStagingPanel({
    files,
    projectId: _projectId,
    setStagedFiles,
    onPlace,
    onClose,
}: BulkFilesStagingPanelProps) {
    const [images, setImages] = useState<StagedImage[]>(() =>
        files.map((file) => ({
            id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            previewUrl: URL.createObjectURL(file),
            useType: null,
            name: '',
            placed: false,
        })),
    );

    const [bulkType, setBulkType] = useState<ImageUseType | null>(null);
    const [bulkDropdownOpen, setBulkDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [slot, setSlot] = useState<Element | null>(null);
    useEffect(() => {
        setSlot(document.getElementById('bulk-files-staging-panel-root'));
    }, []);

    // Clean up object URLs on unmount
    useEffect(() => {
        return () => {
            images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Close bulk dropdown on outside click
    useEffect(() => {
        if (!bulkDropdownOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setBulkDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler, true);
        return () => document.removeEventListener('mousedown', handler, true);
    }, [bulkDropdownOpen]);

    const setType = useCallback((id: string, type: ImageUseType) => {
        setImages((prev) =>
            prev.map((img) => (img.id === id ? { ...img, useType: type } : img)),
        );
    }, []);

    const setName = useCallback((id: string, name: string) => {
        setImages((prev) =>
            prev.map((img) => (img.id === id ? { ...img, name } : img)),
        );
    }, []);

    const removeImage = useCallback((id: string) => {
        setImages((prev) => {
            const removing = prev.find((img) => img.id === id);
            if (removing) URL.revokeObjectURL(removing.previewUrl);
            return prev.filter((img) => img.id !== id);
        });
    }, []);

    const applyBulkType = useCallback((type: ImageUseType) => {
        setBulkType(type);
        setImages((prev) => prev.map((img) => ({ ...img, useType: type })));
        setBulkDropdownOpen(false);
    }, []);

    const handleAddMoreFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newFiles = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
        const newStaged: StagedImage[] = newFiles.map((file) => ({
            id: `staged-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            previewUrl: URL.createObjectURL(file),
            useType: bulkType,
            name: '',
            placed: false,
        }));
        setImages((prev) => [...prev, ...newStaged]);
        // reset input so same file can be re-added if removed
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [bulkType]);

    const readyImages = images.filter((img) => img.useType !== null);
    const unclassifiedCount = images.filter((img) => img.useType === null).length;
    const entityImages = readyImages.filter(
        (img) => getOptionByType(img.useType)?.requiresName && !img.name.trim(),
    );
    const hasNameWarning = entityImages.length > 0;

    const handlePlaceAll = useCallback(async () => {
        const toPlace = readyImages.map((img) => ({
            file: img.file,
            previewUrl: img.previewUrl,
            useType: img.useType as ImageUseType,
            name: img.name.trim() || img.file.name.replace(/\.[^.]+$/, ''),
        }));

        const nodeStore = useNodeStore.getState();
        const projectStore = useProjectStore.getState();
        const entityImages = toPlace.filter((img) => img.useType === 'character' || img.useType === 'location');

        for (const img of entityImages) {
            try {
                const formData = new FormData();
                formData.append('image', img.file);
                formData.append('projectId', _projectId);
                const uploadData = await apiFetchMultipart(api.assets.uploadImage(), formData);

                const entityData = {
                    name: img.name,
                    referenceId: img.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    ...(img.useType === 'character' ? {
                        aliases: [],
                        physicalTraits: {},
                        state: {}
                    } : {
                        timeOfDay: 'day',
                        weather: 'clear'
                    })
                };

                const { entities } = await apiFetch(api.entities.list(), {
                    method: 'POST',
                    body: JSON.stringify({
                        projectId: _projectId,
                        inserts: [{
                            entityType: img.useType,
                            data: entityData
                        }]
                    })
                });

                const newEntity = entities[0];

                if (img.useType === 'character') {
                    projectStore.addCharacter(newEntity);
                } else {
                    projectStore.addLocation(newEntity);
                }

                const canvasNode = NodeFactory.createNode({
                    type: img.useType,
                    entityId: newEntity.id,
                    contextId: _projectId,
                    contextType: 'project',
                    posCanvas: { x: 100 + Math.random() * 400, y: 100 + Math.random() * 400 },
                    scope: 'project',
                });
                nodeStore.addNode(canvasNode);

                await apiFetch(api.assets.list(), {
                    method: 'POST',
                    body: JSON.stringify({
                        projectId: _projectId,
                        entityId: newEntity.id,
                        entityType: img.useType,
                        assetKey: img.useType === 'character' ? 'character_image' : 'location_image',
                        url: uploadData.imagePublicUri
                    })
                });
            } catch (error) {
                console.error('[BulkFilesStagingPanel] Entity creation failed:', error);
            }
        }

        const nonEntityImages = toPlace.filter((img) => img.useType === 'image' || img.useType === 'prop');
        if (nonEntityImages.length > 0) {
            onPlace(nonEntityImages);
        }

        setStagedFiles([]);
    }, [readyImages, onPlace, _projectId]);

    if (images.length === 0) {
        onClose();
        return null;
    }

    const bulkOption = getOptionByType(bulkType);

    if (!slot) {
        return null;
    }

    return createPortal(
        <div
            className="absolute bottom-0 left-0 right-0 z-[200] flex flex-col border-t border-border bg-background/95 backdrop-blur-sm shadow-[0_-8px_32px_rgba(0,0,0,0.4)]"
            style={{ maxHeight: '340px' }}
        >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                            Staging Tray
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {images.length} image{images.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    {/* Divider */}
                    <div className="h-4 w-px bg-border" />

                    {/* Bulk assign dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setBulkDropdownOpen((v) => !v)}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-colors',
                                bulkOption
                                    ? `${bulkOption.activeBg} ${bulkOption.activeText} ${bulkOption.activeBorder}`
                                    : 'border-border text-muted-foreground hover:bg-muted',
                            )}
                        >
                            {bulkOption
                                ? React.createElement(bulkOption.icon, { className: 'w-3 h-3' })
                                : <CheckSquare className="w-3 h-3" />}
                            <span>{bulkOption ? `All → ${bulkOption.label}` : 'Set all to…'}</span>
                            <ChevronDown className="w-3 h-3" />
                        </button>

                        {bulkDropdownOpen && (
                            <div className="absolute bottom-full left-0 mb-1 z-10 min-w-[180px] border border-border bg-popover shadow-lg">
                                {USE_TYPE_OPTIONS.map((opt) => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.type}
                                            type="button"
                                            onClick={() => applyBulkType(opt.type)}
                                            className={cn(
                                                'flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                                                bulkType === opt.type
                                                    ? `${opt.activeBg} ${opt.activeText}`
                                                    : 'hover:bg-muted text-foreground',
                                            )}
                                        >
                                            <Icon className={cn('w-3.5 h-3.5', opt.colorClass)} />
                                            <div className="text-left">
                                                <div className="font-medium">{opt.label}</div>
                                                <div className="text-muted-foreground text-[10px]">{opt.description}</div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Add more */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border text-muted-foreground hover:bg-muted transition-colors"
                    >
                        <Upload className="w-3 h-3" />
                        Add more
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleAddMoreFiles}
                    />
                </div>

                <div className="flex items-center gap-2">
                    {/* Warnings */}
                    {unclassifiedCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                            <AlertCircle className="w-3 h-3" />
                            {unclassifiedCount} unclassified
                        </span>
                    )}
                    {hasNameWarning && (
                        <span className="flex items-center gap-1 text-xs text-amber-400/70">
                            <AlertCircle className="w-3 h-3" />
                            {entityImages.length} unnamed — will use filename
                        </span>
                    )}

                    {/* Place button */}
                    <button
                        type="button"
                        onClick={handlePlaceAll}
                        disabled={readyImages.length === 0}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-all',
                            readyImages.length > 0
                                ? 'bg-primary text-primary-foreground border-primary hover:bg-primary/90'
                                : 'border-border text-muted-foreground opacity-40 cursor-not-allowed',
                        )}
                    >
                        Place {readyImages.length > 0 ? readyImages.length : ''} on Canvas
                        <ArrowRight className="w-3 h-3" />
                    </button>

                    {/* Close */}
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex items-center justify-center w-7 h-7 border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Image strip */}
            <div className="flex gap-3 px-4 py-3 overflow-x-auto overflow-y-hidden">
                {images.map((img) => (
                    <StagedImageCard
                        key={img.id}
                        image={img}
                        onSetType={setType}
                        onSetName={setName}
                        onRemove={removeImage}
                    />
                ))}

                {/* Drop zone appended at end of strip */}
                <div
                    className="flex flex-col items-center justify-center w-[160px] shrink-0 border-2 border-dashed border-border/40 text-muted-foreground/40 cursor-pointer hover:border-border/70 hover:text-muted-foreground transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                >
                    <Upload className="w-5 h-5 mb-1" />
                    <span className="text-[10px]">Add images</span>
                </div>
            </div>
        </div>,
        slot,
    );
}