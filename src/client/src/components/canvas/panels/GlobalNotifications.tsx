import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader, X } from 'lucide-react';
import { usePipelineStore, PipelineEvent } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore, RIGHT_SIDEBAR_DEFAULT_WIDTH, SIDEBAR_GAP } from '../../../store/useCanvasUIStore.js';
import { selectAuxiliarySidebarWidth, useUIMenuStore } from '../../../store/useUIMenuStore.js';
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle } from '#client/components/ui/toast.js';

const NOTIFICATIONS_BASE_OFFSET = 8;
const MAX_VISIBLE_NOTIFICATIONS = 5;
const SUCCESS_AUTO_DISMISS_MS = 9000;

interface VisibleNotification extends PipelineEvent {
  isDismissing?: boolean;
}

const typeVariantMap: Record<string, "default" | "destructive"> = {
  info: "default",
  warn: "default",
  error: "destructive",
  success: "default",
};

const typeIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  warn: AlertCircle,
  error: AlertCircle,
  success: CheckCircle2,
};

export function GlobalNotifications() {
  const events = usePipelineStore((s) => s.events);
  const interrupt = usePipelineStore((s) => s.interrupt);
  const status = usePipelineStore((s) => s.status);
  const rightSidebarOpen = useCanvasUIStore((s) => s.rightSidebarOpen);
  const auxiliarySidebarWidth = useUIMenuStore(selectAuxiliarySidebarWidth);
  const [visibleNotifications, setVisibleNotifications] = useState<VisibleNotification[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const recentEvents = events.slice(0, MAX_VISIBLE_NOTIFICATIONS);
    const newNotifications = recentEvents.filter((evt) => !dismissedIds.has(evt.id));

    setVisibleNotifications((prev) => {
      const notDismissing = prev.filter((n) => !n.isDismissing);
      const merged = [...notDismissing];

      for (const event of newNotifications) {
        if (!merged.find((n) => n.id === event.id)) {
          merged.unshift(event);
        }
      }

      return merged.slice(0, MAX_VISIBLE_NOTIFICATIONS);
    });
  }, [events, dismissedIds]);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    visibleNotifications.forEach((notification) => {
      if (notification.type === 'success' && !notification.isDismissing) {
        const timer = setTimeout(() => {
          dismiss(notification.id);
        }, SUCCESS_AUTO_DISMISS_MS);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [visibleNotifications]);

  const dismiss = (id: string) => {
    setVisibleNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isDismissing: true } : n))
    );

    setTimeout(() => {
      setDismissedIds((prev) => new Set([...prev, id]));
      setVisibleNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 300);
  };

  const isPipelineRunning = ['analyzing', 'generating', 'evaluating'].includes(status);

  const notificationsOffset =
    NOTIFICATIONS_BASE_OFFSET +
    (rightSidebarOpen ? RIGHT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_GAP : 0) +
    (auxiliarySidebarWidth > 0 ? auxiliarySidebarWidth + SIDEBAR_GAP : 0);

  return (
    <div className="absolute top-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
      style={{ right: notificationsOffset }}>
      {isPipelineRunning && (
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
      )}

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

      <ToastProvider>
        {visibleNotifications
          .filter((n) => !n.isDismissing)
          .slice(0, MAX_VISIBLE_NOTIFICATIONS - (interrupt ? 1 : 0) - (isPipelineRunning ? 1 : 0))
          .map((notification) => (
            <NotificationToast
              key={notification.id}
              notification={notification}
              onDismiss={dismiss}
            />
          ))}
      </ToastProvider>
    </div>
  );
}

interface NotificationToastProps {
  notification: PipelineEvent;
  onDismiss: (id: string) => void;
}

function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const Icon = typeIconMap[notification.type] || Info;
  const variant = typeVariantMap[notification.type] || "default";

  return (
    <Toast variant={variant} className="bg-card/50 border border-border rounded-none shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group">
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex flex-col gap-0.5 flex-1 pr-4">
        <ToastTitle className="text-xs font-bold font-mono">
          {notification.type.toUpperCase()}
          {notification.sceneId && ` — SCENE ${notification.sceneId}`}
        </ToastTitle>
        <ToastDescription className="text-xs leading-tight">
          {notification.message}
        </ToastDescription>
      </div>
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => onDismiss(notification.id)}
      >
        <X className="w-3 h-3" />
      </button>
    </Toast>
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