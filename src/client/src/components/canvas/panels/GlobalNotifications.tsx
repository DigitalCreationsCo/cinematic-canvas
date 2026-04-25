import React from 'react';
import { AlertCircle, Info, Loader, X } from 'lucide-react';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore, RIGHT_SIDEBAR_DEFAULT_WIDTH, SIDEBAR_GAP } from '../../../store/useCanvasUIStore.js';
import { selectAuxiliarySidebarWidth, useUIMenuStore } from '../../../store/useUIMenuStore.js';
import { useNotifications } from '#client/hooks/useNotifications.js';

const SUCCESS_AUTO_DISMISS_MS = 9000;

const typeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warn: AlertCircle,
  error: AlertCircle,
  success: Info,
};

export function GlobalNotifications() {
  const { notifications, status, interrupt, dismiss } = useNotifications();
  const events = usePipelineStore((s) => s.events);
  const rightSidebarOpen = useCanvasUIStore((s) => s.rightSidebarOpen);
  const auxiliarySidebarWidth = useUIMenuStore(selectAuxiliarySidebarWidth);

  const notificationsOffset =
    8 +
    (rightSidebarOpen ? RIGHT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_GAP : 0) +
    (auxiliarySidebarWidth > 0 ? auxiliarySidebarWidth + SIDEBAR_GAP : 0);

  return (
    <div className="absolute top-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
      style={{ right: notificationsOffset }}>
      {status === 'analyzing' || status === 'generating' || status === 'evaluating' ? (
        <div className="bg-card border border-border rounded-none shadow-lg p-3 flex gap-3 pointer-events-auto items-start">
          <Loader className='animate-spin' />
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold font-mono">PIPELINE {status.toUpperCase()}</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {events.filter((e) => e.type === 'info').length} events
              </span>
            </div>
            <span className="text-xs text-muted-foreground leading-tight">
              {status === 'analyzing' ? 'Analyzing project structure...' :
                status === 'generating' ? 'Generating scene assets...' :
                  status === 'evaluating' ? 'Evaluating scene quality...' :
                    'Processing...'}
            </span>
          </div>
        </div>
      ) : null}

      {interrupt && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-none shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group">
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div className="flex flex-col gap-0.5 flex-1 pr-4">
            <span className="text-xs font-bold font-mono text-destructive">INTERVENTION REQUIRED</span>
            <span className="text-xs text-destructive/80 leading-tight">{interrupt.error}</span>
          </div>
          <button
            className="absolute top-2 right-2 text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => dismiss(interrupt.commandId)}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {notifications.slice(0, 5).map((notification) => {
        const Icon = typeIconMap[notification.type] || Info;
        return (
          <div
            key={notification.id}
            className="bg-card/50 border border-border rounded-none shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group opacity-80 hover:opacity-100 transition-opacity duration-300"
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5 flex-1 pr-4">
              <span className="text-xs font-bold font-mono">
                {notification.type.toUpperCase()}
                {notification.sceneId && ` — SCENE ${notification.sceneId}`}
              </span>
              <span className="text-xs leading-tight">
                {notification.message}
              </span>
            </div>
            <button
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => dismiss(notification.id)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function PerformanceMetrics() {
  return null;
}