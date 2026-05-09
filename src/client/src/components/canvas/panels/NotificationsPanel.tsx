import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Bell, AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { usePipelineStore, type PipelineEvent } from "#client/store/usePipelineStore.js";
import {
  selectAuxiliarySidebarWidth,
  useUIMenuStore,
} from "#client/store/useUIMenuStore.js";
import { SIDEBAR_GAP } from "#client/store/useCanvasUIStore.js";
import { ScrollArea } from "#client/components/ui/scroll-area.js";
import { cn } from "#client/lib/utils.js";

const NOTIFICATIONS_PANEL_WIDTH = 360;
const AUTO_DISMISS_MS = 5000;

const typeConfig: Record<
  PipelineEvent["type"],
  { icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  info: { icon: Info, className: "text-chart-1 bg-chart-1 border-chart-1/20" },
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

interface NotificationsPanelProps {
  className?: string;
}

export function NotificationsPanel({ className }: NotificationsPanelProps) {
  const notificationsPanelOpen = useUIMenuStore((s) => s.notificationsPanelOpen);
  const closeNotificationsPanel = useUIMenuStore((s) => s.closeNotificationsPanel);
  const auxiliarySidebarWidth = useUIMenuStore(selectAuxiliarySidebarWidth);
  const events = usePipelineStore((s) => s.events);
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

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    clearDismissTimer();
  }, [clearDismissTimer]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    startDismissTimer();
  }, [startDismissTimer]);

  const displayEvents = events.length > 0 ? events : null;
  const FLOATING_MARGIN = 12;
  const rightOffset =
    FLOATING_MARGIN +
    (auxiliarySidebarWidth > 0 ? auxiliarySidebarWidth + SIDEBAR_GAP : 0);

  return (
    notificationsPanelOpen && (
      <motion.div
        initial={{ opacity: 0, x: 200 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 200 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn("absolute flex flex-col z-50 overflow-hidden", className)}
        style={{
          width: NOTIFICATIONS_PANEL_WIDTH,
          top: `1.5rem`,
          maxHeight: `calc(100vh - 3.5rem - ${FLOATING_MARGIN * 2}px)`,
          right: `calc(${rightOffset}px + 1.5rem)`,
        }}
      >
        {/*<div
        className={cn(
          "flex items-center justify-between px-4 py-3 shrink-0",
          "backdrop-blur-xl bg-background/50",
        )}
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4" />
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
          className="p-1 hover:opacity-100 opacity-70 hover:text-foreground rounded-none transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
      </div>*/}

        <div className="flex-1 overflow-hidden pt-2">
          {displayEvents ? (
            <ScrollArea className="h-full">
              <div className="space-y-2 p-3">
                {[...events].reverse().map((event) => (
                  <NotificationCard key={event.id} event={event} />
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-full pt-2">
              <div className="flex items-start gap-2 p-3 rounded-none backdrop-blur-xl bg-background/50 w-full">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">No messages yet</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    )
  );
}
