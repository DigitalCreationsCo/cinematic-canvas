import React from 'react';
import { X, MessageSquare } from 'lucide-react';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { MessageList } from '../../MessageList.js';
import { cn } from '../../../lib/utils.js';

export const MESSAGES_SIDEBAR_WIDTH = 320;

export function MessagesSidebar() {
  const { messagesSidebarOpen, toggleMessagesSidebar } = useCanvasUIStore();
  const events = usePipelineStore((s) => s.events);

  if (!messagesSidebarOpen) return null;

  return (
    <div
      className={cn(
        "absolute right-0 top-0 flex flex-col backdrop-blur-xl shadow-2xl z-20",
        "bg-panel/95 border-l border-panel-border overflow-hidden",
        "transition-all duration-200 ease-out"
      )}
      style={{
        width: MESSAGES_SIDEBAR_WIDTH,
        height: 'calc(100% - 130px)',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Messages</span>
          <span className="text-xs text-muted-foreground">({events.length})</span>
        </div>
        <button
          onClick={toggleMessagesSidebar}
          className="p-1 hover:bg-accent rounded transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <MessageList events={events} />
    </div>
  );
}
