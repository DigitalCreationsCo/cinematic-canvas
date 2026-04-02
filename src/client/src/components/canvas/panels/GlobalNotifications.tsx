import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { usePipelineStore, PipelineEvent } from '../../../store/usePipelineStore.js';
import { useCanvasUIStore } from '../../../store/useCanvasUIStore.js';
import { Loader } from '#client/components/Loader.js';

const MAX_VISIBLE_NOTIFICATIONS = 5;
const SUCCESS_AUTO_DISMISS_MS = 9000;

interface VisibleNotification extends PipelineEvent {
  isDismissing?: boolean;
}

export function GlobalNotifications() {
  const events = usePipelineStore((s) => s.events);
  const interrupt = usePipelineStore((s) => s.interrupt);
  const status = usePipelineStore((s) => s.status);
  const rightSidebarOpen = useCanvasUIStore((s) => s.rightSidebarOpen);
  const messagesSidebarOpen = useCanvasUIStore((s) => s.messagesSidebarOpen);
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

  const MESSAGES_SIDEBAR_WIDTH = 320;
  const RIGHT_SIDEBAR_DEFAULT_WIDTH = 360;
  const notificationsOffset = (rightSidebarOpen ? RIGHT_SIDEBAR_DEFAULT_WIDTH + 16 : 8) +
    (messagesSidebarOpen ? MESSAGES_SIDEBAR_WIDTH + 16 : 8);

  if (messagesSidebarOpen) return null;

  return (
    <div className="absolute top-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
      style={{ right: notificationsOffset }}>
      {/* {isPipelineRunning && (
        <div className="bg-card border border-border rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start">
          <Loader />
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
      )} */}

      {interrupt && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group">
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
    </div>
  );
}

interface NotificationToastProps {
  notification: PipelineEvent;
  onDismiss: (id: string) => void;
}

function NotificationToast({ notification, onDismiss }: NotificationToastProps) {
  const config = {
    info: {
      icon: Info,
      bgClass: 'bg-card/50',
      borderClass: 'border-border',
      textClass: 'text-foreground/80',
      labelClass: 'text-muted-foreground/80',
    },
    warn: {
      icon: AlertCircle,
      bgClass: 'bg-amber-950/50 border border-amber-900/50',
      borderClass: 'border-amber-900/50',
      textClass: 'text-amber-200/80',
      labelClass: 'text-amber-400/80',
    },
    error: {
      icon: AlertCircle,
      bgClass: 'bg-destructive/50 border border-destructive/30',
      borderClass: 'border-destructive/30',
      textClass: 'text-foreground/80',
      labelClass: 'text-foreground/80',
    },
    success: {
      icon: CheckCircle2,
      bgClass: 'bg-success/50 border border-success/30',
      borderClass: 'border-success/30',
      textClass: 'text-success/80',
      labelClass: 'text-success/80',
    },
  }[notification.type];

  const Icon = config.icon;

  return (
    <div
      className={`${config.bgClass} border ${config.borderClass} rounded-md shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group opacity-80 hover:opacity-100 transition-opacity duration-300`}
    >
      <Icon className={`w-4 h-4 ${config.textClass} mt-0.5 shrink-0`} />
      <div className="flex flex-col gap-0.5 flex-1 pr-4">
        <span className={`text-xs font-bold font-mono ${config.labelClass}`}>
          {notification.type.toUpperCase()}
          {notification.sceneId && ` — SCENE ${notification.sceneId}`}
        </span>
        <span className={`text-xs ${config.labelClass} leading-tight`}>
          {notification.message}
        </span>
      </div>
      <button
        className={`absolute top-2 right-2 ${config.labelClass} hover:${config.textClass} opacity-0 group-hover:opacity-100 transition-opacity`}
        onClick={() => onDismiss(notification.id)}
      >
        <X className="w-3 h-3" />
      </button>
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
      <div className="bg-card/80 backdrop-blur-md border border-border rounded-md shadow-sm p-2 flex gap-4 pointer-events-auto text-[10px] font-mono text-muted-foreground">
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
