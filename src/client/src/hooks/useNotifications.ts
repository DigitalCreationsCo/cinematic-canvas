import * as React from "react";
import { usePipelineStore, PipelineEvent } from "../store/usePipelineStore.js";

export type { PipelineEvent };

// Toast configuration extending native toast props
interface ToastConfig {
  id?: string;
  title?: string;
  description?: string;
  variant?: "default" | "info" | "success" | "warning" | "error" | "destructive";
  sceneId?: string;
  duration?: number; // ms, for auto-dismiss (default: no auto-dismiss)
}

// Map our toast variants to PipelineEvent types
const variantToTypeMap: Record<string, PipelineEvent["type"]> = {
  default: "info",
  info: "info",
  success: "success",
  warning: "warn",
  error: "error",
  destructive: "error",
};

// Default auto-dismiss duration for success toasts
const SUCCESS_AUTO_DISMISS_MS = 9000;

// Generate unique IDs
let notificationIdCounter = 0;
function generateNotificationId(): string {
  notificationIdCounter = (notificationIdCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `notif-${notificationIdCounter}-${Date.now()}`;
}

interface UseNotificationsReturn {
  // Function to create a new notification
  toast: (config: ToastConfig) => { id: string; dismiss: () => void };
  // Current visible notifications derived from store
  notifications: PipelineEvent[];
  // Pipeline status for showing pipeline state
  status: import("../store/usePipelineStore.js").PipelineStatus;
  // Interrupt if any
  interrupt: import("../store/usePipelineStore.js").PipelineIntervention | null;
  // Helper to dismiss a notification locally
  dismiss: (id: string) => void;
  // Helper to clear all notifications
  clearAll: () => void;
}

/**
 * useNotifications hook
 * 
 * Manages notifications by syncing with pipeline store events.
 * Provides toast() function to create new notifications.
 * Notifications are persisted in the pipeline store via pushEvent().
 * 
 * @example
 * ```tsx
 * const { toast, notifications, status, interrupt, dismiss } = useNotifications();
 * 
 * // Create a notification
 * toast({ 
 *   title: "Scene Generated", 
 *   description: "Scene 5 is ready", 
 *   variant: "success",
 *   sceneId: "scene-5"
 * });
 * ```
 */
function useNotifications(): UseNotificationsReturn {
  const pushEvent = usePipelineStore((s) => s.pushEvent);
  const clearEvents = usePipelineStore((s) => s.clearEvents);
  const events = usePipelineStore((s) => s.events);
  const status = usePipelineStore((s) => s.status);
  const interrupt = usePipelineStore((s) => s.interrupt);
  
  // Track dismissed IDs locally (they're still in store but hidden in UI)
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  // Create a new notification
  const toast = React.useCallback((config: ToastConfig) => {
    const id = config.id || generateNotificationId();
    const type = variantToTypeMap[config.variant || "default"];
    
    // Push to pipeline store
    pushEvent({
      id,
      type,
      message: config.description || config.title || "",
      timestamp: new Date(),
      sceneId: config.sceneId,
    });

    // Handle auto-dismiss for success notifications
    let autoDismissTimer: ReturnType<typeof setTimeout> | undefined;
    const dismissDuration = config.duration ?? (type === "success" ? SUCCESS_AUTO_DISMISS_MS : undefined);
    
    if (dismissDuration) {
      autoDismissTimer = setTimeout(() => {
        setDismissedIds((prev) => new Set([...prev, id]));
      }, dismissDuration);
    }

    const dismiss = () => {
      if (autoDismissTimer) {
        clearTimeout(autoDismissTimer);
      }
      setDismissedIds((prev) => new Set([...prev, id]));
    };

    return { id, dismiss };
  }, [pushEvent]);

  // Dismiss a specific notification
  const dismiss = React.useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  // Clear all notifications from the store
  const clearAll = React.useCallback(() => {
    setDismissedIds(new Set());
    clearEvents();
  }, [clearEvents]);

  // Filter visible notifications (not dismissed)
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

// Re-export PipelineEvent for consumers
export type { PipelineEvent as Notification };