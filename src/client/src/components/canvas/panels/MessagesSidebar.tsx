import React from 'react';
import { motion } from 'framer-motion';
import { X, MessageCircle } from 'lucide-react';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { MESSAGES_SIDEBAR_WIDTH, selectMessagesSidebarOpen, useUIMenuStore } from '../../../store/useUIMenuStore.js';
import { MessageList } from '../../MessageList.js';
import { cn } from '../../../lib/utils.js';

export function MessagesSidebar({ className }: { className?: string } = {}) {
  const messagesSidebarOpen = useUIMenuStore(selectMessagesSidebarOpen);
  const closeMessagesSidebar = useUIMenuStore((s) => s.closeMessagesSidebar);
  const events = usePipelineStore((s) => s.events);

  if (!messagesSidebarOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "absolute top-0 right-0 flex flex-col backdrop-blur-xl shadow-2xl z-20",
        "bg-panel/95 border-l border-panel-border overflow-hidden",
        "transition-all duration-200 ease-out",
        className
      )}
      style={{
        width: MESSAGES_SIDEBAR_WIDTH,
        height: '100%',
        transformOrigin: 'right',
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Messages</span>
          <span className="text-xs text-muted-foreground">({events.length})</span>
        </div>
        <button
          type="button"
          onClick={closeMessagesSidebar}
          className="p-1 hover:opacity-100 opacity-70 hover:bg-accent rounded-none transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
      </div>

      <MessageList events={events} />
    </motion.div>
  );
}
