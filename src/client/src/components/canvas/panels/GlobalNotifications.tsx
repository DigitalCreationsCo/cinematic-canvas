import React, { useEffect, useState } from 'react';
import { AlertCircle, Info, Loader, X } from 'lucide-react';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore, RIGHT_SIDEBAR_DEFAULT_WIDTH, SIDEBAR_GAP } from '../../../store/useCanvasUIStore.js';
import { selectAuxiliarySidebarWidth, useUIMenuStore } from '../../../store/useUIMenuStore.js';
import { useNotifications } from '#client/hooks/useNotifications.js';

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
    <div className="absolute top-4 z-50 flex flex-col w-80 pointer-events-none"
      style={{ right: notificationsOffset }}>
      {/* {status === 'analyzing' || status === 'generating' || status === 'evaluating' ? (
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
      ) : null} */}

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
            className="bg-background rounded-none shadow-lg p-6 flex gap-3 pointer-events-auto items-start relative group opacity-80 hover:opacity-100 transition-opacity duration-300"
          >
            <div className="flex flex-col gap-0.5 flex-1 pr-4">
              <span className="text-xs font-semibold font-mono">
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
  const [gpuMem, setGpuMem] = useState({ used: 0, total: 24 });
  const [workers, setWorkers] = useState(0);
  const [latency, setLatency] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setGpuMem((prev) => ({
        used: Math.min(prev.total, prev.used + Math.random() * 0.5),
        total: prev.total,
      }));
      setWorkers(Math.floor(Math.random() * 6));
      setLatency(Math.floor(Math.random() * 50) + 20);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-4 right-4 z-50 pointer-events-none">
      <div className="bg-card/80 backdrop-blur-md border border-border rounded-none shadow-sm p-2 flex gap-4 pointer-events-auto text-[10px] font-mono text-muted-foreground">
        <div className="flex flex-col">
          <span className="uppercase opacity-50">GPU MEM</span>
          <span className="text-foreground font-bold">
            {gpuMem.used.toFixed(1)} / {gpuMem.total} GB
          </span>
        </div>
        <div className="w-px bg-border h-6 my-auto" />
        <div className="flex flex-col">
          <span className="uppercase opacity-50">WORKERS</span>
          <span className={`font-bold ${workers > 0 ? 'text-success' : 'text-foreground'}`}>
            {workers} ACTIVE
          </span>
        </div>
        <div className="w-px bg-border h-6 my-auto" />
        <div className="flex flex-col">
          <span className="uppercase opacity-50">LATENCY</span>
          <span className="text-foreground font-bold">{latency}ms</span>
        </div>
      </div>
    </div>
  );
}