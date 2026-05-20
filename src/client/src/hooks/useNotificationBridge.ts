import { useEffect, useRef } from "react";
import { usePipelineStore } from "#client/store/usePipelineStore.js";

/**
 * Bridges pipeline events from the client's usePipelineStore to the
 * frontend app via window-level CustomEvent dispatching.
 *
 * The frontend (AppHeader) listens for 'pipeline-notification' events
 * and pushes them into useAlertStore so they appear in the notification
 * history dropdown.
 *
 * Call this hook once at a top-level component (e.g. App.tsx or canvas page).
 */
export function useNotificationBridge() {
  const events = usePipelineStore((s) => s.events);
  const lastDispatchedRef = useRef<string | null>(null);

  useEffect(() => {
    // Only dispatch for new events (first event in the array is the latest)
    if (events.length === 0) return;

    const latest = events[0];
    if (latest.id === lastDispatchedRef.current) return;

    lastDispatchedRef.current = latest.id;

    window.dispatchEvent(
      new CustomEvent("pipeline-notification", {
        detail: {
          id: latest.id,
          type: latest.type,
          title: latest.message,
          sceneId: latest.sceneId,
          timestamp: latest.timestamp,
        },
      }),
    );
  }, [events]);
}
