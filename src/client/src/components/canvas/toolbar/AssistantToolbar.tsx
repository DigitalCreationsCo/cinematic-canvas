import { Loader, Play, Square, MessageCircle, Bell } from "lucide-react";
import { Button } from "#client/components/ui/button.js";
import { usePipelineStore } from "#client/store/usePipelineStore.js";
import { createPortal } from "react-dom";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useProjectStore } from "#client/store/useProjectStore.js";
import { useJobStore } from "#client/store/useJobStore.js";
import { useUIMenuStore } from "#client/store/useUIMenuStore.js";
import { useChatStore } from "#client/store/useChatStore.js";
import { BadgeIcon } from "#client/components/BadgeIcon.js";
import { ToolCase } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#client/components/ui/tooltip.js";
import { cn } from "#client/lib/utils.js";
import { motion, AnimatePresence } from "framer-motion";
import { ActiveJobsDropdown } from "./ActiveJobsDropdown.js";

interface AssistantToolbarProps {
  handleStart: () => void;
  handleResume: () => void;
  handleStop: () => void;
  projectId?: string;
}

const BUTTON_CLASS = cn(
  "group relative flex justify-center items-center",
  "h-8 py-4.5 pl-3 pr-4 font-mono text-xs uppercase tracking-wide",
  "text-primary hover:text-primary transition-colors duration-200",
  "z-10",
);

const buttonTextStyles =
  "ml-1 flex leading-[1] mb-0! pb-0! mt-1 justify-center whitespace-nowrap";

const MotionButton = motion(Button);

export function AssistantToolbar({
  handleStart,
  handleStop,
  handleResume,
  projectId,
}: AssistantToolbarProps) {
  const status = usePipelineStore((s) => s.status);
  const total = useProjectStore((state) => state.scenes.size || 0);
  const events = usePipelineStore((s) => s.events);
  const [slot, setSlot] = useState<Element | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toggleWorkspaceToolsSidebar = useUIMenuStore(
    (s) => s.toggleWorkspaceToolsSidebar,
  );
  const isWorkspaceToolsSidebarOpen = useUIMenuStore(
    (s) => s.activeAuxiliarySidebar === "tools",
  );
  const toggleNotificationsPanel = useUIMenuStore((s) => s.toggleNotificationsPanel);
  const notificationsPanelOpen = useUIMenuStore((s) => s.notificationsPanelOpen);
  const isChatSidebarOpen = useUIMenuStore((s) => s.activeAuxiliarySidebar === "chat");

  const jobs = useJobStore((state) => state.jobs);
  const activeJobs = useMemo(
    () =>
      Object.values(jobs).filter((j) => j.state === "PENDING" || j.state === "RUNNING"),
    [jobs],
  );
  const hasActiveJobs = activeJobs.length > 0;

  const isLoaded = !!projectId;
  const isPipelineActive = ["analyzing", "generating", "evaluating"].includes(status);

  useEffect(() => {
    setSlot(document.getElementById("assistant-toolbar-slot"));
  }, []);

  const handleOpenChat = useCallback(() => {
    useUIMenuStore.getState().openChatSidebar();
    useChatStore.getState().setViewMode("chat");
    useChatStore.getState().focusChatInput();
  }, []);

  const handleToggleNotifications = useCallback(() => {
    useUIMenuStore.getState().toggleNotificationsPanel();
  }, []);

  // Handle dropdown visibility with delay for job completion signal
  useEffect(() => {
    if (hasActiveJobs) {
      // Jobs exist - show dropdown immediately
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current);
        dropdownTimeoutRef.current = null;
      }
      setShowDropdown(true);
    } else {
      // Jobs completed - delay closing to signal completion
      dropdownTimeoutRef.current = setTimeout(() => {
        setShowDropdown(false);
      }, 2000); // 2 second delay
    }

    return () => {
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current);
      }
    };
  }, [hasActiveJobs]);

  if (!slot) return null;

  return createPortal(
    <div
      className="relative z-[100] flex items-center gap-0.5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <MotionButton
            layout
            size="sm"
            variant="ghost"
            className={cn(BUTTON_CLASS)}
            onClick={() => {
              if (isPipelineActive) {
                confirm("Are you sure you want to stop?") && handleStop();
              } else {
                if (confirm("Are you sure you want to execute this?")) {
                  total === 0 ? handleStart() : handleResume();
                }
              }
            }}
            transition={{ type: "spring", stiffness: 10, damping: 3 }}
          >
            <div className="flex items-center justify-center h-full">
              <div className="relative w-4 h-4 mr-1 flex items-center justify-center shrink-0">
                <AnimatePresence mode="wait">
                  {isPipelineActive || hasActiveJobs ? (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0, height: "100%", scale: 0.5 }}
                      animate={{ opacity: 1, height: "100%", scale: 1 }}
                      exit={{ opacity: 0, height: "100%", scale: 0.5 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Loader className="w-4 h-4 animate-spin absolute group-hover:opacity-0 transition-all" />
                      <Square className="w-3.5 h-3.5 fill-current text-white opacity-0 group-hover:opacity-100 transition-all group-hover:fill-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, height: "100%", scale: 0.5 }}
                      animate={{ opacity: 1, height: "100%", scale: 1 }}
                      exit={{ opacity: 0, height: "100%", scale: 0.5 }}
                    >
                      <Play className="w-4 h-4 group-hover:text-white group-hover:fill-white transition-all" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {isLoaded && (
                <motion.span
                  layout
                  className={cn(
                    buttonTextStyles,
                    !hasActiveJobs && "group-hover:text-white transition-colors",
                  )}
                >
                  {isPipelineActive || hasActiveJobs
                    ? "Generating"
                    : total === 0
                      ? "Start"
                      : "Resume"}
                </motion.span>
              )}
            </div>
          </MotionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="z-[110]">
          {isPipelineActive || hasActiveJobs
            ? "Stop Pipeline"
            : total === 0
              ? "Start Pipeline"
              : "Resume"}
        </TooltipContent>
      </Tooltip>

      <ActiveJobsDropdown projectId={projectId} show={showDropdown && isHovered} />
    </div>,
    slot,
  );
}
