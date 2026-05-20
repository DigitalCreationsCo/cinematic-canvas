import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  selectChatSidebarOpen,
  selectWorkspaceToolsSidebarOpen,
  useUIMenuStore,
} from "@/stores/uiMenuStore";
import { LiquidToolbarGroup } from "../LiquidToolbarGroup";
import ForwardedIconComponent from "@/components/common/genericIconComponent";

export const GlobalActionToolbar = ({
  children
}: { children: React.ReactNode }) => {
  const toggleChatSidebar = useUIMenuStore((s) => s.toggleChatSidebar);
  const isChatSidebarOpen = useUIMenuStore(selectChatSidebarOpen);
  const isWorkspaceToolsSidebarOpen = useUIMenuStore(selectWorkspaceToolsSidebarOpen);

  const handleToggleNotifications = useCallback(() => {
    useUIMenuStore.getState().toggleNotificationsPanel();
  }, []);

  const handleToggleWorkspaceToolsSidebar = useCallback(() => {
    useUIMenuStore.getState().toggleWorkspaceToolsSidebar();
  }, []);

  return (
    <LiquidToolbarGroup>
      <div id="assistant-toolbar-slot" className="flex items-center gap-4 mr-1" />

      {children}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            data-active={isChatSidebarOpen}
            className="h-8 w-8 p-4.5 px-5 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors duration-200"
            onClick={toggleChatSidebar}
          >
            <ForwardedIconComponent
              name="MessagesSquare"
              className={`side-bar-button-size h-4 w-4 ${
               "text-primary"
              }`}
              strokeWidth={2}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="z-[110]">
          Open Chat
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            data-active={isWorkspaceToolsSidebarOpen}
            className="p-4.5 h-8 w-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors duration-200"
            onClick={handleToggleWorkspaceToolsSidebar}
          >
            <ForwardedIconComponent
              name="MessagesSquare"
              className={`side-bar-button-size h-4 w-4 ${
               "text-primary"
              }`}
              strokeWidth={2}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="z-[110]">
          Workspace Tools
        </TooltipContent>
      </Tooltip>
    </LiquidToolbarGroup>
  );
};
