import * as React from "react";
import { usePipelineStore, PipelineEvent } from "../store/usePipelineStore.js";

export type { PipelineEvent };

interface ToastConfig {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "info" | "success" | "warning" | "error" | "destructive";
  sceneId?: string;
  duration?: number;
}

const variantToTypeMap: Record<string, PipelineEvent["type"]> = {
  default: "info",
  info: "info",
  success: "success",
  warning: "warn",
  error: "error",
  destructive: "error",
};

const SUCCESS_AUTO_DISMISS_MS = 9000;
const DEFAULT_AUTO_DISMISS_MS = 5000;

let notificationIdCounter = 0;
function generateNotificationId(): string {
  notificationIdCounter = (notificationIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `notif-${notificationIdCounter}-${Date.now()}`;
}

interface UseNotificationsReturn {
  toast: (config: ToastConfig) => { id: string; dismiss: () => void };
  notifications: PipelineEvent[];
  status: import("../store/usePipelineStore.js").PipelineStatus;
  interrupt: import("../store/usePipelineStore.js").PipelineIntervention | null;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

function useNotifications(): UseNotificationsReturn {
  const pushEvent = usePipelineStore((s) => s.pushEvent);
  const clearEvents = usePipelineStore((s) => s.clearEvents);
  const events = usePipelineStore((s) => s.events);
  const status = usePipelineStore((s) => s.status);
  const interrupt = usePipelineStore((s) => s.interrupt);
  
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    
    events.forEach((evt) => {
      if (!dismissedIds.has(evt.id)) {
        const dismissMs = evt.type === "success" ? SUCCESS_AUTO_DISMISS_MS : DEFAULT_AUTO_DISMISS_MS;
        const timer = setTimeout(() => {
          setDismissedIds((prev) => new Set([...prev, evt.id]));
        }, dismissMs);
        timers.push(timer);
      }
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [events, dismissedIds]);

  const toast = React.useCallback((config: ToastConfig) => {
    const id = config.id || generateNotificationId();
    const type = variantToTypeMap[config.variant || "default"];
    
    pushEvent({
      id,
      type,
      message: config.description || config.title || "",
      timestamp: new Date(),
      sceneId: config.sceneId,
    });

    const dismissMs = config.duration ?? (type === "success" ? SUCCESS_AUTO_DISMISS_MS : DEFAULT_AUTO_DISMISS_MS);
    const timer = setTimeout(() => {
      setDismissedIds((prev) => new Set([...prev, id]));
    }, dismissMs);

    return { id, dismiss: () => {
      clearTimeout(timer);
      setDismissedIds((prev) => new Set([...prev, id]));
    } };
  }, [pushEvent]);

  const dismiss = React.useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const clearAll = React.useCallback(() => {
    setDismissedIds(new Set());
    clearEvents();
  }, [clearEvents]);

  const visibleEvents = React.useMemo(() => {
    return events.filter((evt) => !dismissedIds.has(evt.id));
  }, [events, dismissedIds]);

  return {
    toast,
    notifications: visibleEvents,
    status,
    interrupt,
    dismiss,
    clearAll,
  };
}

export { useNotifications };
export type { PipelineEvent as Notification };