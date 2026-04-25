import * as React from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "#client/components/ui/toast.js"
import { useNotifications } from "#client/hooks/useNotifications.js";

const variantMap: Record<string, "default" | "destructive"> = {
  info: "default",
  success: "default",
  warn: "default",
  error: "destructive",
  default: "default",
};

export function Toaster() {
  const { notifications } = useNotifications();

  return (
    <ToastProvider>
      {notifications.slice(0, 5).map((notification) => (
        <Toast 
          key={notification.id} 
          variant={variantMap[notification.type] || "default"}
        >
          <div className="grid gap-1">
            <ToastTitle className="text-xs font-bold font-mono">
              {notification.type.toUpperCase()}
              {notification.sceneId && ` — SCENE ${notification.sceneId}`}
            </ToastTitle>
            <ToastDescription className="text-xs">
              {notification.message}
            </ToastDescription>
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}