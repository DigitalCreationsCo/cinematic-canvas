import React, { useState, useEffect, useRef } from 'react';
import { ScrollArea } from '../../ui/scroll-area.js';
import { Button } from '../../ui/button.js';
import { Film, FileText, StickyNote, ChevronRight, X, Plus, GripVertical, User, MapPin, Music, FileImage, Sparkles, Clapperboard } from 'lucide-react';
import { TOOLBAR_HEIGHT, useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { hydrateUIPreferences, persistUIPreference } from '../../../store/middleware/uiPreferencesPersistence.js';
import { cn } from '#client/lib/utils.js';
import { Textarea } from '../../ui/textarea.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useDraggable } from "@dnd-kit/core";
import { useWorldEntities } from '../../../hooks/useWorldEntities.js';
import { NewEntityModal } from './NewEntityModal.js';
import { NodeFactory } from '../../../domain/canvas/NodeFactory.js';
import { generateId } from "#shared/utils/id.js";
import { apiFetchMultipart } from '../../../lib/api.js';
import { api } from '../../../lib/routes.js';
import { useAssetStore } from '../../../store/useAssetStore.js';
import { getAllBestAssets } from '../../../../../shared/utils/assets-utils.js';
import { AssetKey } from "../../../../../shared/types/assets.types.js";

const COLLAPSE_DURATION = '200ms';
const COLLAPSE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

type AssetType = 'character' | 'location' | 'audio' | 'style' | 'scene';
type SidebarSection = 'characters' | 'locations' | 'scenes' | 'audio' | 'styleRefs' | 'sequence' | 'screenplay' | 'notes';

interface SectionConfig {
  key: SidebarSection;
  icon: React.ElementType;
  label: string;
  defaultOpen: boolean;
}

const SECTIONS: SectionConfig[] = [
  { key: 'sequence', icon: Film, label: 'Sequence', defaultOpen: false },
  { key: 'characters', icon: User, label: 'Actors', defaultOpen: false },
  { key: 'locations', icon: MapPin, label: 'Sets', defaultOpen: false },
  { key: 'scenes', icon: Clapperboard, label: 'Scenes', defaultOpen: false },
  { key: 'audio', icon: Music, label: 'Audio', defaultOpen: false },
  { key: 'styleRefs', icon: Sparkles, label: 'My Style Refs', defaultOpen: false },
  { key: 'screenplay', icon: FileText, label: 'Screenplay', defaultOpen: false },
  { key: 'notes', icon: StickyNote, label: 'Notes', defaultOpen: false },
];

interface CollapsibleSectionProps {
  section: SectionConfig;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  headerContent?: React.ReactNode;
}

function CollapsibleSection({ section, isOpen, onToggle, children, headerContent }: CollapsibleSectionProps) {
  const Icon = section.icon;

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-2.5 transition-colors group",
          "hover:bg-accent/50 text-left"
        )}
      >
        <ChevronRight
          size={14}
          className="shrink-0 text-muted-foreground transition-transform duration-150"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <Icon size={14} className={cn("shrink-0 transition-colors duration-150", isOpen ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
        <span className={cn(
          "text-xs uppercase tracking-wider flex-1 font-mono transition-colors duration-150",
          isOpen ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {section.label}
        </span>
      </button>

      <div
        className="collapsible-wrapper"
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: `grid-template-rows ${COLLAPSE_DURATION} ${COLLAPSE_EASING}`,
        }}
      >
        <div className="collapsible-inner">
          {headerContent && (
            <div className="collapsible-header">
              {headerContent}
            </div>
          )}
          <div className="collapsible-content">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Draggable Asset Component (moved from TopAssetPanel)
interface DraggableAssetProps {
  id: string;
  type: AssetType;
  name: string;
  img?: string;
  isOnCanvas: boolean;
  onDragStart: (e: React.DragEvent, type: AssetType, entityId: string) => void;
  isWorldEntity?: boolean;
  sceneIndex?: number;
}

const DraggableAsset = ({ id, type, name, img, isOnCanvas, onDragStart, isWorldEntity, sceneIndex }: DraggableAssetProps) => {
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
        "flex items-center gap-2 px-2 py-1 rounded-none border border-transparent transition-colors group w-full shrink-0",
        isOnCanvas
          ? "opacity-40 grayscale cursor-not-allowed"
          : "hover:bg-accent hover:border-border cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
        isWorldEntity && "border-primary/20 bg-primary/5"
      )}
    >
      <div className="w-6 h-6 rounded-none bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {img ? (
          <img src={img} alt={name} className="w-full h-full object-cover" />
        ) : type === 'audio' ? (
          <Music size={10} className="text-muted-foreground" />
        ) : (
          <FileImage size={10} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-1">
          {sceneIndex !== undefined && (
            <span className="text-[9px] font-mono text-primary bg-primary/10 px-1 rounded shrink-0">
              #{sceneIndex + 1}
            </span>
          )}
          <span className="text-[11px] font-medium truncate text-foreground/90 group-hover:text-foreground leading-tight">
            {name} {isWorldEntity && <span className="text-[9px] text-primary ml-1">(World)</span>}
          </span>
        </div>
        {isOnCanvas && (
          <span className="text-[9px] font-mono text-muted-foreground/50">on canvas</span>
        )}
      </div>
    </div>
  );
};

type CombinedSidebarProps = {
  contextId?: string;
  contextType?: 'project' | 'world';
};

export function LeftSidebar({ contextId, contextType }: CombinedSidebarProps) {
  const { sequenceMode, setSequenceMode } = useCanvasUIStore();
  const { characters, locations, scenes, selectedProjectId } = useProjectStore();
  const { nodes } = useNodeStore();
  const { worldCharacters, worldLocations } = useWorldEntities();

  const [openSections, setOpenSections] = useState<Record<SidebarSection, boolean>>({
    characters: true,
    locations: false,
    scenes: false,
    audio: false,
    styleRefs: false,
    sequence: false,
    screenplay: false,
    notes: false,
  });

  // TopAssetPanel state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'character' | 'location' | 'scene'>('character');
  const [draggedImage, setDraggedImage] = useState<File | null>(null);

  const prefs = hydrateUIPreferences();
  const [notesContent, setNotesContent] = useState(prefs.notes);
  const [screenplayContent, setScreenplayContent] = useState(prefs.screenplay);

  useEffect(() => {
    persistUIPreference({ notes: notesContent });
  }, [notesContent]);

  useEffect(() => {
    persistUIPreference({ screenplay: screenplayContent });
  }, [screenplayContent]);

  const toggleSection = (section: SidebarSection) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const isEntityOnCanvas = (entityId: string) => nodes.some((n) => n.data.entityId === entityId);

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
    const audioId = generateId();
    const dataUrl = await readFileAsDataUrl(file);
    const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Imported Audio';
    const projectId = selectedProjectId || contextId || '';

    const audioNode = NodeFactory.createNode({
      type: 'audio',
      entityId: audioId,
      contextId: projectId,
      contextType: contextType || 'project',
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
  };

  const handleStyleRefDrop = async (file: File) => {
    try {
      const styleRefId = generateId();
      const dataUrl = await readFileAsDataUrl(file);
      const displayName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Style Reference';
      const projectId = selectedProjectId || contextId || '';

      const styleNode = NodeFactory.createNode({
        type: 'image',
        entityId: styleRefId,
        contextId: projectId,
        contextType: contextType || 'project',
        posCanvas: { x: 400 + Math.random() * 200, y: 300 + Math.random() * 200 },
        scope: contextType === 'world' ? 'world' : 'project',
        nodeTypeFlag: 'style_reference',
        width: 320,
        height: 320,
        label: displayName,
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
    } catch (error) {
      console.error('[LeftSidebar] Failed to create style reference:', error);
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
            setModalOpen(true);
          }
          break;
        case 'locations':
          if (file.type.startsWith('image/')) {
            setModalType('location');
            setDraggedImage(file);
            setModalOpen(true);
          }
          break;
        case 'audio':
          if (file.type.startsWith('audio/')) {
            handleAudioFileDrop(file);
          }
          break;
        case 'styleRefs':
          if (file.type.startsWith('image/')) {
            handleStyleRefDrop(file);
          }
          break;
        case 'scenes':
          if (file.type.startsWith('image/')) {
            setModalType('scene');
            setDraggedImage(file);
            setModalOpen(true);
          }
          break;
      }
    }
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    if (!openSections[colKey as SidebarSection]) {
      setOpenSections((prev) => ({ ...prev, [colKey]: true }));
    }
    e.dataTransfer.dropEffect = 'copy';
  };

  // Lists
  const characterList = Array.from(characters.values());
  const locationList = Array.from(locations.values());
  const sceneList = Array.from(scenes.values());
  const wCharacterList = Object.values(worldCharacters);
  const wLocationList = Object.values(worldLocations);

  // Asset images
  const assetsRegistry = useAssetStore((state) => state.assets);

  const getBestAssetImage = (entityId: string, assetKey: AssetKey): string | undefined => {
    const registry = assetsRegistry.get(entityId);
    if (!registry) return undefined;
    const bestAssets = getAllBestAssets(registry);
    return bestAssets[assetKey]?.data;
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

  const scenesOnCanvas = useProjectStore(s => s.scenesOnCanvas);

  return (
    <div className={cn(`absolute top-4 left-4 bottom-4 w-72 card-cinematic-glass backdrop-blur-md flex flex-col overflow-hidden z-20`)}>

      <div className="p-4 border-b bg-accent/80 flex items-center justify-between shrink-0 min-h-[52px]">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">Workspace</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => {
              const allClosed: Record<SidebarSection, boolean> = {
                characters: false, locations: false, scenes: false,
                audio: false, styleRefs: false, sequence: false,
                screenplay: false, notes: false
              };
              setOpenSections(allClosed);
            }}
            style={{ visibility: Object.values(openSections).some(Boolean) ? 'visible' : 'hidden' }}
          >
            Collapse All
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">

          {/* Characters Section */}
          <CollapsibleSection
            section={SECTIONS[1]}
            isOpen={openSections.characters}
            onToggle={() => toggleSection('characters')}
            headerContent={
              <div
                onDrop={(e) => handleDrop(e, 'characters')}
                onDragOver={(e) => handleDragOver(e, 'characters')}
                className="px-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setModalType('character'); setDraggedImage(null); setModalOpen(true); }}
                  className="w-full text-[10px] justify-start text-muted-foreground border border-dashed border-border h-6"
                >
                  <Plus className="w-3 h-3 mr-1" /> New Character
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-0.5 px-2 overflow-y-auto">
              {characterList.map((item) => (
                <DraggableAsset
                  key={item.id}
                  id={item.id}
                  type="character"
                  name={item.name}
                  img={characterAssetImages[item.id]}
                  isOnCanvas={isEntityOnCanvas(item.id)}
                  onDragStart={handleDragStart}
                />
              ))}
              {wCharacterList.map((item) => (
                <DraggableAsset
                  key={item.id}
                  id={item.id}
                  type="character"
                  name={item.name}
                  img={wCharacterAssetImages[item.id]}
                  isOnCanvas={isEntityOnCanvas(item.id)}
                  onDragStart={handleDragStart}
                  isWorldEntity
                />
              ))}
              {characterList.length === 0 && wCharacterList.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-1">No characters found</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Locations Section */}
          <CollapsibleSection
            section={SECTIONS[2]}
            isOpen={openSections.locations}
            onToggle={() => toggleSection('locations')}
            headerContent={
              <div
                onDrop={(e) => handleDrop(e, 'locations')}
                onDragOver={(e) => handleDragOver(e, 'locations')}
                className="px-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setModalType('location'); setDraggedImage(null); setModalOpen(true); }}
                  className="w-full text-[10px] justify-start text-muted-foreground border border-dashed border-border h-6"
                >
                  <Plus className="w-3 h-3 mr-1" /> New Location
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-0.5 px-2 overflow-y-auto">
              {locationList.map((item) => (
                <DraggableAsset
                  key={item.id}
                  id={item.id}
                  type="location"
                  name={item.name}
                  img={locationAssetImages[item.id]}
                  isOnCanvas={isEntityOnCanvas(item.id)}
                  onDragStart={handleDragStart}
                />
              ))}
              {wLocationList.map((item) => (
                <DraggableAsset
                  key={item.id}
                  id={item.id}
                  type="location"
                  name={item.name}
                  img={wLocationAssetImages[item.id]}
                  isOnCanvas={isEntityOnCanvas(item.id)}
                  onDragStart={handleDragStart}
                  isWorldEntity
                />
              ))}
              {locationList.length === 0 && wLocationList.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-1">No locations found</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Scenes Section */}
          <CollapsibleSection
            section={SECTIONS[3]}
            isOpen={openSections.scenes}
            onToggle={() => toggleSection('scenes')}
            headerContent={
              <div
                onDrop={(e) => handleDrop(e, 'scenes')}
                onDragOver={(e) => handleDragOver(e, 'scenes')}
                className="px-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setModalType('scene'); setDraggedImage(null); setModalOpen(true); }}
                  className="w-full text-[10px] justify-start text-muted-foreground border border-dashed border-border h-6"
                >
                  <Plus className="w-3 h-3 mr-1" /> New Scene
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-0.5 px-2 overflow-y-auto">
              {sceneList.map((item) => (
                <DraggableAsset
                  key={item.id}
                  id={item.id}
                  type="scene"
                  name={item.name}
                  img={sceneAssetImages[item.id]}
                  isOnCanvas={isEntityOnCanvas(item.id)}
                  onDragStart={handleDragStart}
                  sceneIndex={item.sceneIndex}
                />
              ))}
              {sceneList.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-1">No scenes found</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Audio Section */}
          <CollapsibleSection
            section={SECTIONS[4]}
            isOpen={openSections.audio}
            onToggle={() => toggleSection('audio')}
            headerContent={
              <div
                onDrop={(e) => handleDrop(e, 'audio')}
                onDragOver={(e) => handleDragOver(e, 'audio')}
                className="px-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-[10px] justify-start text-muted-foreground border border-dashed border-border h-6"
                >
                  <Plus className="w-3 h-3 mr-1" /> New Audio
                </Button>
              </div>
            }
          >
            <p className="text-[10px] text-muted-foreground px-2 py-1">No audio assets found</p>
          </CollapsibleSection>

          {/* Style Refs Section */}
          <CollapsibleSection
            section={SECTIONS[5]}
            isOpen={openSections.styleRefs}
            onToggle={() => toggleSection('styleRefs')}
            headerContent={
              <div
                onDrop={(e) => handleDrop(e, 'styleRefs')}
                onDragOver={(e) => handleDragOver(e, 'styleRefs')}
                className="px-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleStyleRefDrop(file);
                    };
                    input.click();
                  }}
                  className="w-full text-[10px] justify-start text-muted-foreground border border-dashed border-border h-6"
                >
                  <Plus className="w-3 h-3 mr-1" /> New Style Ref
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-0.5 px-2 overflow-y-auto">
              {nodes.filter(n => n.type === 'image' && n.data.nodeTypeFlag === 'style_reference').map(node => {
                const data = node.data as any;
                return (
                  <DraggableAsset
                    key={node.id}
                    id={data.entityId as string}
                    type="style"
                    name={(data.label || 'Style Ref') as string}
                    img={getBestAssetImage(data.entityId as string, 'image_file')}
                    isOnCanvas={true}
                    onDragStart={handleDragStart as any}
                  />
                );
              })}
              {nodes.filter(n => n.type === 'image' && n.data.nodeTypeFlag === 'style_reference').length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 py-1">No style refs found</p>
              )}
            </div>
          </CollapsibleSection>

          {/* Sequence Section */}
          <CollapsibleSection
            section={SECTIONS[0]}
            isOpen={openSections.sequence}
            onToggle={() => toggleSection('sequence')}
          >
            <div className="space-y-3 px-4">
              <div className="flex border p-1 rounded-none">
                <Button
                  variant={sequenceMode === 'canvas' ? 'ghost' : 'ghost'}
                  size="sm"
                  className={`flex-1 h-6 text-[10px] ${sequenceMode === 'canvas' ? 'shadow-sm' : ''}`}
                  onClick={() => setSequenceMode('canvas')}
                >
                  Canvas Edges
                </Button>
                <Button
                  variant={sequenceMode === 'explicit' ? 'ghost' : 'ghost'}
                  size="sm"
                  className={`flex-1 h-6 text-[10px] ${sequenceMode === 'explicit' ? 'shadow-sm' : ''}`}
                  onClick={() => setSequenceMode('explicit')}
                >
                  Linear List
                </Button>
              </div>

              {sequenceMode === 'explicit' ? (
                <div className="space-y-1">
                  <div className="text-[10px] italic p-2 border border-dashed rounded-none text-muted-foreground">
                    Drag scenes in the list below to explicitly reorder them.
                  </div>
                  <div className="flex flex-col gap-1 mt-2">
                    {scenesOnCanvas.map((scene) => (
                      <div
                        key={scene.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-none border border-border/50 hover:bg-accent/50 cursor-grab active:cursor-grabbing group"
                      >
                        <GripVertical size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
                        <div className="w-6 h-6 rounded-none bg-muted flex items-center justify-center text-[10px] font-medium shrink-0">
                          {scene.sceneIndex}
                        </div>
                        <span className="text-[11px] truncate flex-1">Scene {scene.sceneIndex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-muted-foreground p-2">
                  Scenes are ordered by canvas edge connections. Enable "Linear List" to manually reorder.
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Screenplay Section */}
          <CollapsibleSection
            section={SECTIONS[6]}
            isOpen={openSections.screenplay}
            onToggle={() => toggleSection('screenplay')}
          >
            <div className="space-y-2 px-3">
              <Textarea
                value={screenplayContent}
                onChange={(e) => setScreenplayContent(e.target.value)}
                placeholder={`Paste your screenplay.
The assistant reads your screenplay to understand your long-form narrative.`}
                className="min-h-[120px] text-[11px] resize-none bg-background/10 border-border/50 focus:border-primary"
              />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground">
                  {screenplayContent.length} characters
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  disabled={!screenplayContent.trim()}
                >
                  <Plus size={12} className="mr-1" />
                  Add Scene
                </Button>
              </div>
            </div>
          </CollapsibleSection>

          {/* Notes Section */}
          <CollapsibleSection
            section={SECTIONS[7]}
            isOpen={openSections.notes}
            onToggle={() => toggleSection('notes')}
          >
            <div className="space-y-2 px-3">
              <Textarea
                value={notesContent}
                onChange={(e) => setNotesContent(e.target.value)}
                placeholder="Add notes, ideas, or reminders..."
                className="min-h-[150px] text-[11px] resize-none bg-background/10 border-border/50 focus:border-primary"
              />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-muted-foreground">
                  {notesContent.length} characters
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  disabled={!notesContent.trim()}
                  onClick={() => {
                    setNotesContent('');
                    persistUIPreference({ notes: '' });
                  }}
                >
                  <X size={12} className="mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          </CollapsibleSection>

        </div>
      </ScrollArea>

      {modalOpen && selectedProjectId && (
        <NewEntityModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setDraggedImage(null); }}
          entityType={modalType}
          initialImageFile={draggedImage}
          projectId={selectedProjectId}
        />
      )}
    </div>
  );
}