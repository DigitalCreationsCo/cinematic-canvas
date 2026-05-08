import { X } from "lucide-react";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useJobStore } from "#client/store/useJobStore.js";
import { api } from "#client/lib/api.js";
import { cn } from "#client/lib/utils.js";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────────────

interface ActiveJobsDropdownProps {
  projectId?: string;
  show: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getJobTypeName(type: string): string {
  const typeMap: Record<string, string> = {
    GENERATE_SCENE_VIDEO: "Scene Video",
    GENERATE_SCENE_FRAMES: "Scene Frames",
    GENERATE_CHARACTER_IMAGE: "Character Image",
    GENERATE_LOCATION_IMAGE: "Location Image",
    ANALYZE_AUDIO: "Audio Analysis",
  };
  return typeMap[type] || type;
}

function getStateColor(state: string): string {
  switch (state) {
    case "RUNNING":
      return "text-orange-400";
    case "PENDING":
      return "text-blue-400";
    case "COMPLETED":
      return "text-green-400";
    case "FAILED":
      return "text-red-400";
    case "CANCELLED":
      return "text-gray-400";
    default:
      return "text-gray-300";
  }
}

const CONFIRM_TIMEOUT_MS = 4000;

// ── Component ────────────────────────────────────────────────────────────────

export function ActiveJobsDropdown({ projectId, show }: ActiveJobsDropdownProps) {
  const jobs = useJobStore((state) => state.jobs);
  const activeJobs = useMemo(
    () =>
      Object.values(jobs).filter(
        (j) => j.state === "PENDING" || j.state === "RUNNING",
      ),
    [jobs],
  );

  const [confirmingJobId, setConfirmingJobId] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConfirming = useCallback(() => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
    setConfirmingJobId(null);
  }, []);

  // Clear confirming state when the dropdown hides
  useEffect(() => {
    if (!show) {
      clearConfirming();
    }
  }, [show, clearConfirming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  const startConfirming = useCallback((jobId: string) => {
    setConfirmingJobId(jobId);

    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
    }
    confirmTimeoutRef.current = setTimeout(() => {
      setConfirmingJobId(null);
      confirmTimeoutRef.current = null;
    }, CONFIRM_TIMEOUT_MS);
  }, []);

  const executeCancel = useCallback(
    async (jobId: string) => {
      if (!projectId) return;
      clearConfirming();
      try {
        await api.jobs.cancel.mutate({ projectId, jobId });
      } catch (error) {
        console.error("Failed to cancel job:", error);
      }
    },
    [projectId, clearConfirming],
  );

  return (
    <AnimatePresence>
      {show && activeJobs.length > 0 && (
        <motion.div
          key="dropdown"
          initial={{ opacity: 0, y: 4, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.95 }}
          className="absolute top-full left-0 pt-2 z-[120]"
        >
          <div className="w-72 bg-neutral-900/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-white/5 bg-white/5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Active Jobs ({activeJobs.length})
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 border-b border-white/5 last:border-0 transition-colors",
                    confirmingJobId === job.id
                      ? "bg-red-500/10"
                      : "hover:bg-white/5",
                  )}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-xs font-medium truncate text-white/90">
                      {getJobTypeName(job.type)}
                    </div>
                    <div className="text-[10px] truncate text-muted-foreground font-mono">
                      {job.id.slice(0, 8)} •{" "}
                      <span className={cn("font-bold", getStateColor(job.state))}>
                        {job.state}
                      </span>
                    </div>
                  </div>

                  {confirmingJobId === job.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-red-400 whitespace-nowrap font-medium">
                        Cancel?
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          executeCancel(job.id);
                        }}
                        className="px-1.5 py-0.5 text-[10px] font-medium bg-red-500/25 text-red-400 rounded hover:bg-red-500/40 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          clearConfirming();
                        }}
                        className="px-1.5 py-0.5 text-[10px] font-medium bg-white/10 text-white/60 rounded hover:bg-white/20 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startConfirming(job.id);
                      }}
                      className="p-1.5 hover:bg-red-500/20 rounded-md text-white/40 hover:text-red-400 transition-all focus-visible:ring-2 focus-visible:ring-red-500"
                      title="Cancel Job"
                      data-no-header-track="true"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
