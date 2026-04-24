import { motion } from 'framer-motion';
import { cn } from '#client/lib/utils.js';
import { TOOLS_SIDEBAR_WIDTH, selectWorkspaceToolsSidebarOpen, useUIMenuStore } from '#client/store/useUIMenuStore.js';

import { WORKSPACE_TOOLS } from './workspaceTools.js';

export function ToolsSidebar({ className }: { className?: string } = {}) {
  const workspaceToolsSidebarOpen = useUIMenuStore(selectWorkspaceToolsSidebarOpen);
  const activeTools = useUIMenuStore((s) => s.activeTools);
  const toggleActiveTool = useUIMenuStore((s) => s.toggleActiveTool);

  if (!workspaceToolsSidebarOpen) return null;

  const activeToolSet = new Set(activeTools);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'absolute top-0 right-0 z-20 flex h-full flex-col overflow-hidden bg-transparent',
        'transition-all duration-200 ease-out',
        className,
      )}
      style={{ width: TOOLS_SIDEBAR_WIDTH, transformOrigin: 'center' }}
    >
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {WORKSPACE_TOOLS.map((tool) => {
            const isActive = activeToolSet.has(tool.id);
            const Icon = tool.icon;

            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => toggleActiveTool(tool.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-none border p-3 text-left transition-colors',
                  isActive
                    ? 'border-primary/50 bg-primary/10'
                    : 'border-border/60 bg-background/40 hover:bg-accent/40',
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-none border border-border/60 bg-card">
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{tool.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
