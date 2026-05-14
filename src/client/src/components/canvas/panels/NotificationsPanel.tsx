import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  X,
  Bell,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
} from "lucide-react";
import { usePipelineStore, type PipelineEvent } from "#client/store/usePipelineStore.js";
import {
  selectAuxiliarySidebarWidth,
  useUIMenuStore,
} from "#client/store/useUIMenuStore.js";
import { useCanvasUIStore, RIGHT_SIDEBAR_DEFAULT_WIDTH, SIDEBAR_GAP } from "#client/store/useCanvasUIStore.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import { cn } from "#client/lib/utils.js";
import { useNotifications } from "#client/hooks/useNotifications.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const NOTIFICATIONS_PANEL_WIDTH = 360;
const AUTO_DISMISS_MS = 5000;

const typeConfig: Record<
  PipelineEvent["type"],
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  info: {
    icon: Info,
    className: "text-chart-1 bg-chart-1 border-chart-1/20",
  },
  warn: {
    icon: AlertTriangle,
    className: "text-chart-4 bg-chart-4 border-chart-4/20",
  },
  error: {
    icon: AlertCircle,
    className: "text-destructive bg-destructive border-destructive/20",
  },
  success: {
    icon: CheckCircle,
    className: "text-chart-3 bg-chart-3 border-chart-3/20",
  },
};

const toastTypeIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  info: Info,
  warn: AlertCircle,
  error: AlertCircle,
  success: Info,
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function NotificationCard({ event }: { event: PipelineEvent }) {
  const config = typeConfig[event.type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-2.5 rounded-none border",
        "backdrop-blur-xl",
        config.className,
      )}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm break-words">{event.message}</p>
        <div className="flex items-center gap-2 mt-1 text-muted-foreground text-xs">
          <span className="font-mono">
            {new Date(event.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          {event.sceneId !== undefined && (
            <span className="font-mono">Scene #{event.sceneId}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface NotificationsPanelProps {
  className?: string;
}

export function NotificationsPanel({ className }: NotificationsPanelProps) {
  // ── Store state ──
  const notificationsPanelOpen = useUIMenuStore(
    (s) => s.notificationsPanelOpen,
  );
  const closeNotificationsPanel = useUIMenuStore(
    (s) => s.closeNotificationsPanel,
  );
  const auxiliarySidebarWidth = useUIMenuStore(selectAuxiliarySidebarWidth);
  const events = usePipelineStore((s) => s.events);
  const rightSidebarOpen = useCanvasUIStore((s) => s.rightSidebarOpen);

  // ── Toast/interrupt state ──
  const { notifications, interrupt, dismiss } = useNotifications();

  // ── Panel auto-dismiss timer ──
  const [isHovered, setIsHovered] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = setTimeout(() => {
      if (!isHovered) {
        closeNotificationsPanel();
      }
    }, AUTO_DISMISS_MS);
  }, [isHovered, closeNotificationsPanel]);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (notificationsPanelOpen) {
      startDismissTimer();
    } else {
      clearDismissTimer();
    }
    return () => clearDismissTimer();
  }, [notificationsPanelOpen, startDismissTimer, clearDismissTimer]);

  // ── Offset calculations ──
  const FLOATING_MARGIN = 12;
  const rightOffset =
    FLOATING_MARGIN +
    (auxiliarySidebarWidth > 0 ? auxiliarySidebarWidth + SIDEBAR_GAP : 0);

  const toastsRight =
    8 +
    (rightSidebarOpen ? RIGHT_SIDEBAR_DEFAULT_WIDTH + SIDEBAR_GAP : 0) +
    (auxiliarySidebarWidth > 0 ? auxiliarySidebarWidth + SIDEBAR_GAP : 0);

  const displayEvents = events.length > 0 ? events : null;

  return (
    <>
      {/* ── Interrupt Banner — always visible when present ── */}
      {interrupt && (
        <div
          className="absolute top-4 z-[60] flex flex-col w-80 pointer-events-none"
          style={{ right: toastsRight }}
        >
          <div className="bg-destructive/10 border border-destructive/30 shadow-lg p-3 flex gap-3 pointer-events-auto items-start relative group">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5 flex-1 pr-4">
              <span className="text-xs font-bold font-mono text-destructive">
                INTERVENTION REQUIRED
              </span>
              <span className="text-xs text-destructive/80 leading-tight">
                {interrupt.error}
              </span>
            </div>
            <button
              className="absolute top-2 right-2 text-destructive/50 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => dismiss(interrupt.commandId)}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Stack — shown when panel is closed ── */}
      {!notificationsPanelOpen && notifications.length > 0 && (
        <div
          className="absolute top-4 z-50 flex flex-col gap-2 w-80 pointer-events-none"
          style={{ right: toastsRight }}
        >
          {notifications.slice(0, 5).map((notification) => {
            const Icon = toastTypeIconMap[notification.type] || Info;
            return (
              <div
                key={notification.id}
                className="bg-background shadow-lg p-6 flex gap-3 pointer-events-auto items-start relative group opacity-80 hover:opacity-100 transition-opacity duration-300"
              >
                <div className="flex flex-col gap-0.5 flex-1 pr-4">
                  <span className="text-xs font-semibold font-mono">
                    {notification.type.toUpperCase()}
                    {notification.sceneId &&
                      ` — SCENE ${notification.sceneId}`}
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
      )}

      {/* ── Slide-in Notifications Panel ── */}
      {notificationsPanelOpen && (
        <motion.div
          initial={{ opacity: 0, x: 200 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 200 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onMouseEnter={() => {
            setIsHovered(true);
            clearDismissTimer();
          }}
          onMouseLeave={() => {
            setIsHovered(false);
            startDismissTimer();
          }}
          className={cn(
            "absolute flex flex-col z-50 overflow-hidden",
            className,
          )}
          style={{
            width: NOTIFICATIONS_PANEL_WIDTH,
            top: `1.5rem`,
            maxHeight: `calc(100vh - 3.5rem - ${FLOATING_MARGIN * 2}px)`,
            right: `calc(${rightOffset}px + 1.5rem)`,
          }}
        >
          {/* Header */}
          {/* <div className="flex items-center justify-between px-4 py-3 shrink-0 backdrop-blur-xl bg-background/50 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Notifications</span>
              {events.length > 0 && (
                <span className="text-xs text-muted-foreground font-mono">
                  ({events.length})
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={closeNotificationsPanel}
              className="p-1 hover:opacity-100 opacity-70 hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div> */}

          {/* Event list */}
          <div className="flex-1 overflow-hidden">
            {displayEvents ? (
              <ScrollArea className="h-full">
                <div className="space-y-2 p-3">
                  {[...events].reverse().map((event) => (
                    <NotificationCard key={event.id} event={event} />
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-start gap-2 p-3 backdrop-blur-xl bg-background/50 w-full">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground">
                      No messages yet
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </>
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
      <div className="bg-card/80 backdrop-blur-md border border-border shadow-sm p-2 flex gap-4 pointer-events-auto text-[10px] font-mono text-muted-foreground">
        <div className="flex flex-col">
          <span className="uppercase opacity-50">GPU MEM</span>
          <span className="text-foreground font-bold">
            {gpuMem.used.toFixed(1)} / {gpuMem.total} GB
          </span>
        </div>
        <div className="w-px bg-border h-6 my-auto" />
        <div className="flex flex-col">
          <span className="uppercase opacity-50">WORKERS</span>
          <span
            className={`font-bold ${workers > 0 ? "text-success" : "text-foreground"}`}
          >
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
