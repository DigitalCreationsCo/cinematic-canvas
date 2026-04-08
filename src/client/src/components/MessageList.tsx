import { ScrollArea } from "./ui/scroll-area.js";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";
import { cn } from "../lib/utils.js";
import type { PipelineEvent } from "../store/usePipelineStore.js";

interface MessageListProps {
  events: PipelineEvent[];
}

const typeConfig = {
  info: { icon: Info, className: 'text-chart-1 bg-chart-1/10 border-chart-1/20' },
  warn: { icon: AlertTriangle, className: 'text-chart-4 bg-chart-4/10 border-chart-4/20' },
  error: { icon: AlertCircle, className: 'text-destructive bg-destructive/10 border-destructive/20' },
  success: { icon: CheckCircle, className: 'text-chart-3 bg-chart-3/10 border-chart-3/20' },
};

export function MessageList({ events }: MessageListProps) {
  const reversedEvents = [...events].reverse();

  if (reversedEvents.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 text-sm">
        No messages yet
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-3">
        {reversedEvents.map((event) => {
          const config = typeConfig[event.type];
          const Icon = config.icon;

          return (
            <div
              key={event.id}
              className={cn(
                'flex items-start gap-2 p-2.5 rounded-none border',
                config.className
              )}
            >
              <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm break-words">{event.message}</p>
                <div className="flex items-center gap-2 mt-1 text-muted-foreground text-xs">
                  <span className="font-mono">
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  {event.sceneId !== undefined && (
                    <span className="font-mono">Scene #{event.sceneId}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
