import React from 'react';
import { User, MapPin, Music3, Sparkles, FolderOpen, Plus } from 'lucide-react';
import { useProjectStore } from '../../../store/useProjectStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { useNodeStore } from '../../../store/useNodeStore.js';
import { NodeFactory } from '../../../domain/canvas/NodeFactory.js';
import { screenToWorld } from '../../../domain/canvas/CoordinateSystem.js';
import { Button } from '../../ui/button.js';
import { ScrollArea } from '../../ui/scroll-area.js';

type SectionKey = 'characters' | 'locations' | 'audio' | 'style';

const SECTION_CONFIG: Record<SectionKey, { icon: React.ReactNode, title: string; }> = {
  characters: { icon: <User className="w-4 h-4" />, title: 'Characters' },
  locations: { icon: <MapPin className="w-4 h-4" />, title: 'Locations' },
  audio: { icon: <Music3 className="w-4 h-4" />, title: 'Audio' },
  style: { icon: <Sparkles className="w-4 h-4" />, title: 'Style Refs' },
};

export function TopAssetPanel({ contextId, contextType }: { contextId: string, contextType: 'project' | 'world'; }) {
  const { characters, locations } = useProjectStore();
  const { openToolSections, toggleToolSection } = useCanvasUIStore();
  const { viewport, addNode, nodes } = useNodeStore();

  const handleDragStart = (e: React.DragEvent, type: any, entityId: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ type, entityId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const isEntityOnCanvas = (entityId: string) => {
    return nodes.some(n => n.data.entityId === entityId);
  };

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 flex gap-2">
      { (Object.keys(SECTION_CONFIG) as SectionKey[]).map((key) => {
        const isOpen = openToolSections.includes(key);
        const config = SECTION_CONFIG[ key ];

        // Mock data mapping (normally filtered by type)
        const items = key === 'characters' ? Object.values(characters) :
          key === 'locations' ? Object.values(locations) : [];

        return (
          <div key={ key } className="flex flex-col items-center">
            {/* Toggle Button */ }
            <Button
              variant={ isOpen ? 'default' : 'secondary' }
              size="sm"
              className={ `rounded-full shadow-lg border-2 ${isOpen ? 'border-indigo-500 bg-indigo-900 text-indigo-100 hover:bg-indigo-800' : 'border-gray-800 bg-gray-900 text-gray-400 hover:text-gray-200'}` }
              onClick={ () => toggleToolSection(key) }
            >
              { config.icon }
              <span className="ml-2 font-semibold text-xs tracking-wider">{ config.title }</span>
            </Button>

            {/* Dropdown Panel */ }
            { isOpen && (
              <div className="absolute top-12 mt-2 w-64 bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-2xl overflow-hidden p-2 flex flex-col gap-2">
                <ScrollArea className="max-h-64 h-full">
                  { items.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500">No assets found</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      { items.map((item) => {
                        const isOnCanvas = isEntityOnCanvas(item.id);
                        return (
                          <div
                            key={ item.id }
                            draggable={ !isOnCanvas }
                            onDragStart={ (e) => handleDragStart(e, key === 'characters' ? 'character' : 'location', item.id) }
                            className={ `
                              relative aspect-square rounded-lg border flex items-end p-2 cursor-grab active:cursor-grabbing overflow-hidden group
                              ${isOnCanvas ? 'border-gray-800 opacity-50 grayscale cursor-not-allowed' : 'border-gray-700 hover:border-indigo-500 hover:shadow-lg transition-all'}
                            `}
                          >
                            <span className="relative z-10 text-[10px] font-bold text-white bg-black/60 px-1 rounded truncate w-full shadow-sm">
                              { item.name }
                            </span>
                            { !isOnCanvas && (
                              <div className="absolute inset-0 bg-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            ) }
                          </div>
                        );
                      }) }
                    </div>
                  ) }
                </ScrollArea>
                <Button variant="ghost" size="sm" className="w-full text-xs text-gray-400 border border-dashed border-gray-700 mt-1">
                  <Plus className="w-3 h-3 mr-1" /> Create New
                </Button>
              </div>
            ) }
          </div>
        );
      }) }
    </div>
  );
}
