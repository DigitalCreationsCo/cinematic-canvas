import { useEffect, useState } from 'react';
import type { PipelineMessage } from '@shared/pipeline-types';

export function usePipelineEvents() {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<PipelineMessage | null>(null);

  useEffect(() => {
    const eventSource = new EventSource('/api/sse');

    eventSource.onopen = () => {
      setConnected(true);
      console.log('SSE Connected');
    };

    // Handle "message" events (which corresponds to 'message' type from server)
    eventSource.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
      } catch (e) {
        console.error('Failed to parse SSE message', e);
      }
    });

    eventSource.addEventListener('connected', () => {
        setConnected(true);
    });

    eventSource.onerror = () => {
      setConnected(false);
      // EventSource tries to reconnect automatically, so we don't need to close it explicitly
      // unless we want to stop retrying.
    };

    return () => {
      eventSource.close();
      setConnected(false);
    };
  }, []);

  return { connected, lastMessage };
}
