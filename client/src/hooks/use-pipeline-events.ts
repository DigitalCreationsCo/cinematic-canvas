import { useEffect, useState } from "react";
import { PipelineEvent } from "@shared/pubsub-types"; // Import the new type
import { GraphState } from "@shared/pipeline-types";

interface UsePipelineEventsProps {
  projectId: string | null;
}

export function usePipelineEvents({ projectId }: UsePipelineEventsProps) {
  const [ connected, setConnected ] = useState(false);
  const [ pipelineState, setPipelineState ] = useState<GraphState | null>(null);
  const [ isHydrated, setIsHydrated ] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setConnected(false);
      setPipelineState(null);
      setIsHydrated(false);
      return;
    }

    const eventSource = new EventSource(`/api/events/${projectId}`);

    eventSource.onopen = () => {
      setConnected(true);
      console.log(`SSE Connected for projectId: ${projectId}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const parsedEvent = JSON.parse(event.data) as PipelineEvent;

        if (parsedEvent.type === "FULL_STATE") {
          if (!isHydrated) {
            setPipelineState(parsedEvent.payload.state);
            setIsHydrated(true);
            console.log(`Pipeline state fully hydrated from FULL_STATE event for projectId: ${projectId}`);
          } else {
            // Subsequent FULL_STATE messages update state
            setPipelineState(parsedEvent.payload.state);
            console.log(`Pipeline state updated from FULL_STATE event for projectId: ${projectId}`);
          }
        }
        // TODO: Handle other event types like SCENE_COMPLETED, WORKFLOW_COMPLETED, etc.
      } catch (e) {
        console.error("Failed to parse SSE event", e);
      }
    };

    eventSource.onerror = (error) => {
      console.error(`SSE Error for projectId ${projectId}:`, error);
      setConnected(false);
      // EventSource tries to reconnect automatically
    };

    return () => {
      eventSource.close();
      setConnected(false);
      console.log(`SSE Disconnected for projectId: ${projectId}`);
    };
  }, [ projectId, isHydrated ]);

  return { connected, pipelineState, isHydrated };
}
