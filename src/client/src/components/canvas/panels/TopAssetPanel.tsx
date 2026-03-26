import React, { useState } from "react";
import { User, MapPin, Music, FileImage, Sparkles, Plus, Clapperboard } from "lucide-react";
import { Button } from "#/components/ui/button.js";
import { useDraggable } from "@dnd-kit/core";
import { cn } from "#/lib/utils.js";
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { useWorldEntities } from '../../../hooks/useWorldEntities.js';
import { NewEntityModal } from './NewEntityModal.js';
import { NodeFactory } from '../../../domain/canvas/NodeFactory.js';
import { v7 as uuidv7 } from 'uuid';
import { apiFetchMultipart } from '../../../lib/api.js';
import { api } from '../../../lib/routes.js';
import { useAssetStore, useCharacterAssets, useLocationAssets, useSceneAssets } from '../../../store/useAssetStore.js';
import { getAllBestAssets } from '../../../../../shared/utils/assets-utils.js';

type AssetType = 'character' | 'location' | 'audio' | 'style' | 'scene';

interface DraggableAssetProps {
  id: string;
  type: AssetType;
  name: string;
  img?: string;
  isOnCanvas: boolean;
  onDragStart: (e: React.DragEvent, type: AssetType, entityId: string) => void;
  isWorldEntity?: boolean;
}

const DraggableAsset = ({ id, type, name, img, isOnCanvas, onDragStart, isWorldEntity }: DraggableAssetProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { type, name, entityId: id },
    disabled: isOnCanvas,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      draggable={!isOnCanvas}
      onDragStart={(e) => !isOnCanvas && onDragStart(e, type, id)}
      title={isOnCanvas ? `${name} is already on the canvas` : name}
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md border border-transparent transition-colors group",
        isOnCanvas
          ? "opacity-40 grayscale cursor-not-allowed"
          : "hover:bg-accent hover:border-border cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
        isWorldEntity && "border-primary/20 bg-primary/5"
      )}
    >
      <div className="w-6 h-6 rounded bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {img ? (
          <img src={img} alt={name} className="w-full h-full object-cover" />
        ) : type === 'audio' ? (
          <Music size={10} className="text-muted-foreground" />
        ) : (
          <FileImage size={10} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[11px] font-medium truncate text-foreground/90 group-hover:text-foreground leading-tight">
          {name} {isWorldEntity && <span className="text-[9px] text-primary ml-1">(World)</span>}
        </span>
        {isOnCanvas && (
          <span className="text-[9px] font-mono text-muted-foreground/50">on canvas</span>
        )}
      </div>
    </div>
  );
};

interface ColumnDef {
  key: string;
  icon: React.ElementType;
  label: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'characters', icon: User, label: 'Characters' },
  { key: 'style', icon: Sparkles, label: 'Style Refs' },
  { key: 'scenes', icon: Clapperboard, label: 'Scenes' },
  { key: 'locations', icon: MapPin, label: 'Locations' },
  { key: 'audio', icon: Music, label: 'Audio Tracks' },
];

const MIN_SIZE = 32;
const MAX_HEIGHT = 200;
const TRANSITION_DURATION = "150ms";
const TRANSITION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";
const COLUMN_WIDTH = 140;

export function TopAssetPanel({ contextId, contextType }: { contextId: string; contextType: 'project' | 'world'; }) {
  const { characters, locations, scenes, selectedProjectId } = useProjectStore();
  const { nodes } = useNodeStore();
  const { worldCharacters, worldLocations } = useWorldEntities();

  // Debug logging for store values
  console.debug('[TopAssetPanel] Store values', {
    charactersCount: characters.size,
    locationsCount: locations.size,
    scenesCount: scenes.size,
    selectedProjectId,
    worldCharactersCount: Object.keys(worldCharacters).length,
    worldLocationsCount: Object.keys(worldLocations).length,
    nodesCount: nodes.length,
  });

  const [openCols, setOpenCols] = useState<Record<string, boolean>>({
    characters: false,
    locations: false,
    audio: false,
    style: false,
    scenes: false,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'character' | 'location' | 'scene'>('character');
  const [draggedImage, setDraggedImage] = useState<File | null>(null);
  const [draggedFileType, setDraggedFileType] = useState<AssetType | null>(null);

  const isOpenCount = Object.values(openCols).filter(Boolean).length;
  const isPanelExpanded = isOpenCount > 0;
  const isEntityOnCanvas = (entityId: string) => nodes.some((n) => n.data.entityId === entityId);

  const toggleCol = (key: string) => {
    setOpenCols((prev) => {
      const nextColumnState = { ...prev, [key]: !prev[key] };
      console.debug(`[TopAssetPanel::toggleCol] Trace: toggled '${key}'. New layout state:`, nextColumnState);
      return nextColumnState;
    });
  };

  const handleDragStart = (e: React.DragEvent, type: AssetType, entityId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, entityId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAudioFileDrop = async (file: File) => {
    const audioId = uuidv7();
    const dataUrl = await readFileAsDataUrl(file);
    const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Imported Audio';

    const audioNode = NodeFactory.createNode({
      type: 'audio',
      entityId: audioId,
      contextId: selectedProjectId || contextId,
      contextType,
      posCanvas: { x: 400 + Math.random() * 200, y: 300 + Math.random() * 200 },
      scope: contextType === 'world' ? 'world' : 'project',
      nodeTypeFlag: 'import',
      width: 320,
      height: 150,
    });
    audioNode.data.audioSrc = dataUrl;
    audioNode.data.audioFileName = displayName;
    audioNode.data.audioTitle = displayName;

    useNodeStore.getState().addNode(audioNode);

    useProjectStore.getState().updateMetadata({
      audioPublicUri: dataUrl,
      audioGcsUri: undefined,
      hasAudio: true,
    });

    console.debug('[TopAssetPanel] Created AudioNode from drop:', { audioId, fileName: file.name });
  };

  const handleStyleRefDrop = async (file: File) => {
    try {
      const styleRefId = uuidv7();
      const dataUrl = await readFileAsDataUrl(file);
      const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Style Reference';

      const styleNode = NodeFactory.createNode({
        type: 'image',
        entityId: styleRefId,
        contextId: selectedProjectId || contextId,
        contextType,
        posCanvas: { x: 400 + Math.random() * 200, y: 300 + Math.random() * 200 },
        scope: contextType === 'world' ? 'world' : 'project',
        nodeTypeFlag: 'style_reference',
        width: 320,
        height: 320,
      });

      useNodeStore.getState().addNode(styleNode);

      if (selectedProjectId) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('projectId', selectedProjectId);
        formData.append('name', displayName);
        formData.append('description', 'Style reference');

        const uploadData = await apiFetchMultipart(api.assets.uploadImage(), formData);

        useAssetStore.getState().mergeAssets(styleRefId, {
          image_file: {
            head: 1,
            best: 1,
            versions: [{
              version: 1,
              data: uploadData.imagePublicUri,
              type: 'image',
              metadata: {},
              createdAt: new Date(),
              startedAt: new Date(),
            }],
          },
        });
      }

      console.debug('[TopAssetPanel] Created StyleRef from drop:', { styleRefId, fileName: file.name });
    } catch (error) {
      console.error('[TopAssetPanel] Failed to create style reference:', error);
    }
  };

  const handleDrop = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];

      switch (colKey) {
        case 'characters':
          if (file.type.startsWith('image/')) {
            setModalType('character');
            setDraggedImage(file);
            setDraggedFileType('character');
            setModalOpen(true);
          }
          break;
        case 'locations':
          if (file.type.startsWith('image/')) {
            setModalType('location');
            setDraggedImage(file);
            setDraggedFileType('location');
            setModalOpen(true);
          }
          break;
        case 'audio':
          if (file.type.startsWith('audio/')) {
            handleAudioFileDrop(file);
            return;
          }
          break;
        case 'style':
          if (file.type.startsWith('image/')) {
            handleStyleRefDrop(file);
            return;
          }
          break;
        case 'scenes':
          if (file.type.startsWith('image/')) {
            setModalType('scene');
            setDraggedImage(file);
            setDraggedFileType('scene');
            setModalOpen(true);
          }
          break;
      }
    }
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    if (!openCols[colKey]) {
      setOpenCols((prev) => ({ ...prev, [colKey]: true }));
    }
    e.dataTransfer.dropEffect = 'copy';
  };

  const characterList = Array.from(characters.values());
  const locationList = Array.from(locations.values());
  const sceneList = Array.from(scenes.values());
  const wCharacterList = Object.values(worldCharacters);
  const wLocationList = Object.values(worldLocations);

  // Pre-compute asset images to avoid calling hooks inside .map()
  // (React hooks cannot be called inside loops - this would violate Rules of Hooks)
  const assetsRegistry = useAssetStore((state) => state.assets);

  const getBestAssetImage = (entityId: string, assetKey: string): string | undefined => {
    const registry = assetsRegistry.get(entityId);
    if (!registry) return undefined;
    const bestAssets = getAllBestAssets(registry);
    return bestAssets[assetKey as keyof typeof bestAssets]?.data;
  };

  const characterAssetImages = Object.fromEntries(
    characterList.map((c) => [c.id, getBestAssetImage(c.id, 'character_image')])
  );
  const wCharacterAssetImages = Object.fromEntries(
    wCharacterList.map((c) => [c.id, getBestAssetImage(c.id, 'character_image')])
  );
  const locationAssetImages = Object.fromEntries(
    locationList.map((l) => [l.id, getBestAssetImage(l.id, 'location_image')])
  );
  const wLocationAssetImages = Object.fromEntries(
    wLocationList.map((l) => [l.id, getBestAssetImage(l.id, 'location_image')])
  );
  const sceneAssetImages = Object.fromEntries(
    sceneList.map((s) => [s.id, getBestAssetImage(s.id, 'scene_start_frame')])
  );

  const columnContent: Record<string, React.ReactNode> = {
    characters: (
      <>
        {(characterList.length === 0 && wCharacterList.length === 0) ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No characters found</p>
        ) : (
          <>
            {characterList.map((item) => (
              <DraggableAsset key={item.id} id={item.id} type="character" name={item.name} img={characterAssetImages[item.id]} isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart} />
            ))}
            {wCharacterList.map((item) => (
              <DraggableAsset key={item.id} id={item.id} type="character" name={item.name} img={wCharacterAssetImages[item.id]} isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart} isWorldEntity />
            ))}
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setModalType('character'); setDraggedImage(null); setModalOpen(true); }} className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Character
        </Button>
      </>
    ),
    locations: (
      <>
        {(locationList.length === 0 && wLocationList.length === 0) ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No locations found</p>
        ) : (
          <>
            {locationList.map((item) => (
              <DraggableAsset key={item.id} id={item.id} type="location" name={item.name} img={locationAssetImages[item.id]} isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart} />
            ))}
            {wLocationList.map((item) => (
              <DraggableAsset key={item.id} id={item.id} type="location" name={item.name} img={wLocationAssetImages[item.id]} isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart} isWorldEntity />
            ))}
          </>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setModalType('location'); setDraggedImage(null); setModalOpen(true); }} className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Location
        </Button>
      </>
    ),
    audio: (
      <>
        <p className="text-[10px] text-muted-foreground px-2 py-1">No audio assets found</p>
        <Button variant="ghost" size="sm" className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Audio
        </Button>
      </>
    ),
    style: (
      <>
        <p className="text-[10px] text-muted-foreground px-2 py-1">No style refs found</p>
        <Button variant="ghost" size="sm" className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Style Ref
        </Button>
      </>
    ),
    scenes: (
      <>
        {sceneList.length === 0 ? (
          <p className="text-[10px] text-muted-foreground px-2 py-1">No scenes found</p>
        ) : (
          sceneList.map((item) => (
            <DraggableAsset key={item.id} id={item.id} type="scene" name={item.name} img={sceneAssetImages[item.id]} isOnCanvas={isEntityOnCanvas(item.id)} onDragStart={handleDragStart} />
          ))
        )}
        <Button variant="ghost" size="sm" onClick={() => { setModalType('scene'); setDraggedImage(null); setModalOpen(true); }} className="w-full text-[10px] text-muted-foreground border border-dashed border-border mt-1 h-6 shrink-0">
          <Plus className="w-3 h-3 mr-1" /> New Scene
        </Button>
      </>
    ),
  };

  return (
    <>
      <div
        className="w-full flex justify-center bg-card/60 border-b border-border overflow-hidden transition-all"
        style={{
          height: isPanelExpanded ? `${MAX_HEIGHT}px` : `${MIN_SIZE}px`,
          transitionDuration: TRANSITION_DURATION,
          transitionTimingFunction: TRANSITION_EASING
        }}
      >
        <div
          className="flex h-full transition-all justify-center flex-wrap"
          style={{
            width: '100%',
            maxWidth: '100vw',
            transitionDuration: TRANSITION_DURATION,
            transitionTimingFunction: TRANSITION_EASING
          }}
        >
          {COLUMNS.map((col) => {
            const isOpen = openCols[col.key];
            const Icon = col.icon;

            return (
              <div
                key={col.key}
                onDrop={(e) => handleDrop(e, col.key)}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onClick={() => {
                  if (!isOpen) {
                    console.debug(`[TopAssetPanel::clickTrace] User initiated column open for: ${col.key}`);
                    toggleCol(col.key);
                  }
                }}
                className={cn(
                  "relative flex flex-col border-r border-border last:border-r-0 overflow-hidden transition-all",
                  !isOpen && "hover:bg-accent/30  cursor-pointer",
                  (!isOpen && isPanelExpanded) && "justify-end"
                )}
                style={{
                  width: `${COLUMN_WIDTH}px`,
                  flexShrink: 0,
                  transitionDuration: TRANSITION_DURATION,
                  transitionTimingFunction: TRANSITION_EASING
                }}
              >
                {isOpen && (
                  <div className="flex-1 overflow-y-auto px-1 py-1 custom-scrollbar">
                    {columnContent[col.key]}
                  </div>
                )}

                <div
                  onClick={(e) => {
                    if (isOpen) {
                      e.stopPropagation();
                      console.debug(`[TopAssetPanel::clickTrace] User initiated column close for: ${col.key}`);
                      toggleCol(col.key);
                    }
                  }}
                  className={cn(
                    "flex items-center justify-center shrink-0 transition-all cursor-pointer",
                    isOpen ? "border-t border-border/40 gap-2 h-8 px-3" : "h-8 w-full group"
                  )}
                  style={{
                    transitionTimingFunction: TRANSITION_EASING
                  }}
                >
                  <Icon size={14} className={cn(isOpen ? "text-primary" : "text-muted-foreground group-hover:text-foreground", "shrink-0")} />
                  {isOpen && (
                    <span className="text-[10px] font-mono text-foreground truncate">
                      {col.label.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && selectedProjectId && (
        <NewEntityModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setDraggedImage(null); setDraggedFileType(null); }}
          entityType={modalType}
          initialImageFile={draggedImage}
          projectId={selectedProjectId}
        />
      )}
    </>
  );
}