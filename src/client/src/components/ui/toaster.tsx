import * as React from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "#client/components/ui/toast.js"
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import type { PipelineEvent } from "#client/store/usePipelineStore.js";

export function Toaster() {
  const events = usePipelineStore((state) => state.events);
  const [notifications, setNotifications] = React.useState<Array<{
    id: string;
    title?: React.ReactNode;
    description?: React.ReactNode;
    action?: React.ReactNode;
  }>>([]);

  React.useEffect(() => {
    setNotifications(
      events.map(event => ({
        id: event.id,
        title: event.type.toUpperCase(),
        description: event.message,
      }))
    );
  }, [events]);

  return (
    <ToastProvider>
      {notifications.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
