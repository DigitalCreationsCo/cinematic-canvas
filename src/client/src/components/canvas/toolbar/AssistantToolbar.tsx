// src/client/src/components/AssistantToolbar.tsx
import { Loader, Play, Square, X } from 'lucide-react';
import { Button } from '../../ui/button.js';
import { usePipelineStore } from '../../../store/usePipelineStore.js';
import { createPortal } from 'react-dom';
import { useEffect, useState, useMemo } from 'react';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useJobStore, selectActiveJobs } from '#client/store/useJobStore.js';
import { api } from '#client/lib/api.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#client/components/ui/tooltip.js';
import { cn } from '#client/lib/utils.js';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../../Header.module.css';

interface AssistantToolbarProps {
  handleStart: () => void;
  handleResume: () => void;
  handleStop: () => void;
  projectId?: string;
}

// Unified styles for both states to prevent layout shift
const BUTTON_CLASS = cn(
  "group relative flex justify-center items-center",
  "h-8 p-2 pl-3 pr-4 font-mono text-xs uppercase tracking-wide",
  "text-primary hover:text-primary transition-colors duration-200",
  "overflow-hidden z-10"
);

const buttonTextStyles = "ml-2 flex leading-[1] mb-0! pb-0! mt-0.5! justify-center whitespace-nowrap";

const MotionButton = motion(Button);

export function AssistantToolbar({ handleStart, handleStop, handleResume, projectId }: AssistantToolbarProps) {
  const status = usePipelineStore((s) => s.status);
  const total = useProjectStore((state) => state.scenes.size || 0);
  const [slot, setSlot] = useState<Element | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const jobs = useJobStore((state) => state);
  const activeJobs = useMemo(() => selectActiveJobs(jobs), [jobs]);

  const isRunning = ['analyzing', 'generating', 'evaluating'].includes(status);
  const isLoaded = !!projectId;

  useEffect(() => {
    setSlot(document.getElementById('agent-toolbar-slot'));
  }, []);

  const cancelJob = async (jobId: string) => {
    if (!projectId) return;
    if (!confirm(`Are you sure you want to cancel job ${jobId}?`)) return;
    try {
      await api.jobs.cancel.mutate({ projectId, jobId });
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const getJobTypeName = (type: string): string => {
    const typeMap: Record<string, string> = {
      'GENERATE_SCENE_VIDEO': 'Scene Video',
      'GENERATE_SCENE_FRAMES': 'Scene Frames',
      'GENERATE_CHARACTER_IMAGE': 'Character Image',
      'GENERATE_LOCATION_IMAGE': 'Location Image',
      'ANALYZE_AUDIO': 'Audio Analysis',
    };
    return typeMap[type] || type;
  };

  const getStateColor = (state: string): string => {
    switch (state) {
      case 'RUNNING': return 'text-orange-400';
      case 'PENDING': return 'text-blue-400';
      case 'COMPLETED': return 'text-green-400';
      case 'FAILED': return 'text-red-400';
      case 'CANCELLED': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  if (!slot) return null;

  return createPortal(
    <div
      className={cn(styles.toolbarGroup, "relative z-[100] mr-1")} // High z-index to ensure dropdown isn't clipped
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <MotionButton
            layout // Framer Motion handles the width transition
            size="sm"
            variant="ghost"
            className={cn(BUTTON_CLASS)}
            onClick={() => {
              if (isRunning) {
                confirm('Are you sure you want to stop?') && handleStop();
              } else {
                if (confirm('Are you sure you want to execute this?')) {
                  total === 0 ? handleStart() : handleResume();
                }
              }
            }}
            transition={{ type: "spring", stiffness: 10, damping: 3 }}
          >
            <div className="flex items-center justify-center h-full">
              {/* Icon Container with Fixed Width to prevent twitching */}
              <div className="relative w-4 h-4 mr-1 flex items-center justify-center shrink-0">
                <AnimatePresence mode="wait">
                  {isRunning ? (
                    <motion.div
                      key="active"
                      initial={{ opacity: 0, height: '100%', scale: 0.5 }}
                      animate={{ opacity: 1, height: '100%', scale: 1 }}
                      exit={{ opacity: 0, height: '100%', scale: 0.5 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <Loader className="w-4 h-4 animate-spin absolute group-hover:opacity-0 transition-all" />
                      <Square className="w-3.5 h-3.5 fill-current text-white opacity-0 group-hover:opacity-100 transition-all group-hover:fill-white" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, height: '100%', scale: 0.5 }}
                      animate={{ opacity: 1, height: '100%', scale: 1 }}
                      exit={{ opacity: 0, height: '100%', scale: 0.5 }}
                    >
                      <Play className="w-4 h-4 group-hover:text-white group-hover:fill-white transition-all" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Label */}
              {isLoaded && (
                <motion.span layout className={cn(buttonTextStyles, !isRunning && 'group-hover:text-white transition-colors')}>
                  {isRunning ? (
                    status === 'analyzing' ? 'Analyzing' :
                      status === 'generating' ? 'Generating' :
                        status === 'evaluating' ? 'Evaluating' : 'Running'
                  ) : (
                    total === 0 ? 'Start' : 'Resume'
                  )}
                </motion.span>
              )}
            </div>
          </MotionButton>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="z-[110]">
          {isRunning ? 'Stop Pipeline' : (total === 0 ? 'Start Pipeline' : 'Resume')}
        </TooltipContent>
      </Tooltip>

      {/* Active Jobs Dropdown */}
      <AnimatePresence>
        {isRunning && isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            // 1. Remove mt-2 and w-72 from here. 
            // 2. Add pt-2 to create the invisible hover bridge.
            className="absolute top-full left-0 pt-2 z-[120]"
          >
            {/* Move the styling and width to this inner container */}
            <div className="w-72 bg-neutral-900/95 backdrop-blur-md border border-white/10 rounded-lg shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-white/5 bg-white/5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Active Jobs ({activeJobs.length})
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {activeJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="text-xs font-medium truncate text-white/90">{getJobTypeName(job.type)}</div>
                      <div className="text-[10px] truncate text-muted-foreground font-mono">
                        {job.id.slice(0, 8)} • <span className={cn("font-bold", getStateColor(job.state))}>{job.state}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
                      className="p-1.5 hover:bg-red-500/20 rounded-md text-white/40 hover:text-red-400 transition-all"
                      title="Cancel Job"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    slot,
  );
}