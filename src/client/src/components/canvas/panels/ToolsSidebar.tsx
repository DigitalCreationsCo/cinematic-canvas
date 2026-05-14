import { motion, AnimatePresence } from 'framer-motion';
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
      transition={{ duration: 0.08, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        'absolute m-3 top-0 right-0 z-20 flex h-full flex-col pointer-events-auto',
        'transition-all duration-200 ease-out h-auto',
        className,
      )}
      style={{ width: TOOLS_SIDEBAR_WIDTH, transformOrigin: 'center' }}
    >
      {/* Buttons container - no flex-1 so it shrinks to fit the active button(s) */}
      <div className="overflow-y-auto">
        <div className="space-y-2">
          <AnimatePresence
            mode="popLayout"
            initial={false}>
            {WORKSPACE_TOOLS.filter((tool) => activeToolSet.size === 0 || activeToolSet.has(tool.id)).map((tool) => {
              const isActive = activeToolSet.has(tool.id);
              const Icon = tool.icon;

              return (
                <motion.button
                  layout
                  key={tool.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
                  transition={{ duration: 0.2 }}
                  type="button"
                  onClick={() => toggleActiveTool(tool.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded border p-3 text-left transition-colors',
                    isActive
                      ? 'border-border bg-popover'
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
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Dynamic Workspace Tool Container - placed outside overflow-y to allow horizontal overflow */}
      <div id="workspace-tool-container" className="flex-1 w-full relative pointer-events-none h-auto" />
    </motion.div>
  );
}
