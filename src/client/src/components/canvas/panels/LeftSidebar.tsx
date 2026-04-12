import React, { useState, useEffect } from 'react';
import { ScrollArea } from '../../ui/scroll-area.js';
import { Button } from '../../ui/button.js';
import { Film, FileText, StickyNote, ChevronDown, ChevronRight, X, Plus, GripVertical } from 'lucide-react';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { hydrateUIPreferences, persistUIPreference } from '../../../store/middleware/uiPreferencesPersistence.js';
import { cn } from '#client/lib/utils.js';
import { Textarea } from '../../ui/textarea.js';
import { useNodeStore } from '#client/store/useNodeStore.js';
import { useProjectStore } from '#client/store/useProjectStore.js';

type SidebarSection = 'sequence' | 'screenplay' | 'notes';

interface SectionConfig {
  key: SidebarSection;
  icon: React.ElementType;
  label: string;
  defaultOpen: boolean;
}

const SECTIONS: SectionConfig[] = [
  { key: 'sequence', icon: Film, label: 'Sequence', defaultOpen: true },
  { key: 'screenplay', icon: FileText, label: 'Screenplay', defaultOpen: false },
  { key: 'notes', icon: StickyNote, label: 'Notes', defaultOpen: false },
];

const SECTION_TRANSITION_DURATION = "50ms";
const SECTION_TRANSITION_EASING = "cubic-bezier(0.4, 0, 0.2, 1)";

interface CollapsibleSectionProps {
  section: SectionConfig;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({ section, isOpen, onToggle, children }: CollapsibleSectionProps) {
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
        {isOpen ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
        {/* <Icon size={14} className={cn("shrink-0", isOpen ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} /> */}
        <span className={cn(
          "text-xs uppercase tracking-wider flex-1 font-mono",
          isOpen ? "text-foreground font-medium" : "text-muted-foreground group-hover:text-foreground"
        )}>
          {section.label}
        </span>
      </button>

      <div
        className="overflow-hidden transition-all"
        style={{
          maxHeight: isOpen ? '500px' : '0px',
          opacity: isOpen ? 1 : 0,
          transitionDuration: SECTION_TRANSITION_DURATION,
          transitionTimingFunction: SECTION_TRANSITION_EASING,
        }}
      >
        <div className="pt-1 pb-2">
          {children}
        </div>
      </div>
    </div>
  );
}

export function LeftSidebar() {
  const { sequenceMode, setSequenceMode } = useCanvasUIStore();

  const [openSections, setOpenSections] = useState<Record<SidebarSection, boolean>>({
    sequence: true,
    screenplay: false,
    notes: false,
  });

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

  const scenesOnCanvas = useProjectStore(s => s.scenesOnCanvas);

  return (
    <div className="absolute top-4 left-4 bottom-4 w-72 card-cinematic-glass backdrop-blur-md flex flex-col overflow-hidden z-20">

      <div className="p-4 border-b bg-accent/80 flex items-center justify-between shrink-0 min-h-[52px]">
        <span className="text-xs tracking-wide text-muted-foreground uppercase">Workspace</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setOpenSections({ sequence: false, screenplay: false, notes: false })}
            style={{ visibility: Object.values(openSections).some(Boolean) ? 'visible' : 'hidden' }}
          >
            Collapse All
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">

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

          <CollapsibleSection
            section={SECTIONS[1]}
            isOpen={openSections.screenplay}
            onToggle={() => toggleSection('screenplay')}
          >
            <div className="space-y-2 px-3">
              <Textarea
                value={screenplayContent}
                onChange={(e) => setScreenplayContent(e.target.value)}
                placeholder="Write your screenplay here..."
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

          <CollapsibleSection
            section={SECTIONS[2]}
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
    </div>
  );
}
