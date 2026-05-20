import { X, AlertCircle, Info } from "@tabler/icons-react";
import { useNotifications } from "#client/hooks/useNotifications.js";

const toastTypeIconMap: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  info: Info,
  warn: AlertCircle,
  error: AlertCircle,
  success: Info,
};

export function NotificationsPanel() {
  const { notifications, interrupt, dismiss } = useNotifications();

  return (
    <>
      {interrupt && (
        <div className="absolute top-4 right-2 z-[60] flex flex-col w-80 pointer-events-none">
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

      {notifications.length > 0 && (
        <div className="absolute top-4 right-2 z-50 flex flex-col gap-2 w-80 pointer-events-none">
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
    </>
  );
}
