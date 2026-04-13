// src/client/src/components/AgentToolbar.tsx
import { Loader, Play, Square, X } from 'lucide-react';
import { Button } from './ui/button.js';
import { usePipelineStore } from '../store/usePipelineStore.js';
import { createPortal } from 'react-dom';
import { useEffect, useState, useMemo } from 'react';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { useJobStore, selectActiveJobs } from '#client/store/useJobStore.js';
import { api } from '#client/lib/routes.js';
import { apiFetch } from '#client/lib/api.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#client/components/ui/tooltip.js';

interface AgentToolbarProps {
  handleStart: () => void;
  handleResume: () => void;
  handleStop: () => void;
  projectId?: string;
}

const BUTTON_CLASS = [
  'group relative flex justify-center items-center bg-white/20',
  'h-8 p-2 px-3 rounded-full',
  'text-white hover:text-white bg-transparent hover:bg-transparent',
  'overflow-hidden z-10',
  'max-w-[44px] transition-[max-width] duration-200 delay-0 group-hover:delay-500 group-hover:max-w-[120px]',
].join(' ');

export function AgentToolbar({ handleStart, handleStop, handleResume, projectId }: AgentToolbarProps) {
  const status = usePipelineStore((s) => s.status);
  const total = useProjectStore((state) => state.scenes.size || 0);
  const [slot, setSlot] = useState<Element | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Get active jobs from the job store
  const jobs = useJobStore((state) => state);
  const activeJobs = useMemo(
    () => selectActiveJobs(jobs),
    [jobs]
  );

  const cancelJob = async (jobId: string) => {
    if (!projectId) return;
    if (!confirm(`Are you sure you want to cancel job ${jobId}?`)) return;
    
    try {
      await apiFetch(api.jobs.cancel(projectId, jobId), { method: 'DELETE' });
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

  useEffect(() => {
    setSlot(document.getElementById('agent-toolbar-slot'));
  }, []);

  if (!slot) return null;

  const isRunning = ['analyzing', 'generating', 'evaluating'].includes(status);
  const isLoaded = !!projectId;

  return createPortal(
    <>
      {!isRunning ? (
        /*
         * ── Play / Resume Button ─────────────────────────────────────────────
         *
         * PASSIVE TRIGGER: this button owns the 50ms expand animation but NOT
         * its hover background — the Header slider provides that via the RAF
         * loop. Mouse tracking is driven by a native DOM 'mousemove' listener
         * on the slot node in Header (see Header.tsx), which resolves the
         * button element via closest('button') and calls startTracking(button).
         *
          * NOTE on Tailwind JIT: group-hover:max-w-[120px] must appear as a
          * complete static string in source — never as a dynamic concatenation
          * — so that Tailwind's scanner includes it in the CSS output.
          */
        <div 
          className="relative group/btn"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => { setIsHovered(false); }}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className={BUTTON_CLASS}
                onClick={() => {
                  if (confirm('Are you sure you want to execute this?')) {
                    total === 0 ? handleStart() : handleResume();
                  }
                }}
              >
                <Play className="w-4 h-4 shrink-0" />

                {isLoaded && (
                  <span className="ml-2 font-bold font-mono tracking-wide uppercase whitespace-nowrap opacity-0 group-hover/btn:opacity-100 transition-opacity duration-200 delay-0">
                    {total === 0 ? 'Start' : 'Resume'}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-50">
              {total === 0 ? 'Start Pipeline' : 'Resume Pipeline'}
            </TooltipContent>
          </Tooltip>
          
          {isHovered && activeJobs.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
              <div className="px-3 py-2 border-b border-border bg-muted/50">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Running Jobs ({activeJobs.length})
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {activeJobs.map((job) => (
                  <div 
                    key={job.id} 
                    className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 border-b border-border/50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-foreground">
                        {getJobTypeName(job.type)}
                      </div>
                      <div className="text-xs truncate text-muted-foreground">
                        {job.id.slice(0, 8)}... • <span className={getStateColor(job.state)}>{job.state}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelJob(job.id);
                      }}
                      className="ml-2 p-1 hover:bg-destructive/20 rounded text-destructive/70 hover:text-destructive transition-colors"
                      title="Cancel Job"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /*
         * ── Stop / Running Button ────────────────────────────────────────────
         * Same passive-trigger pattern. Status label expands to 160px max —
         * wide enough for "Generating" in mono caps.
         */
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className={BUTTON_CLASS}
              onClick={() => {
                confirm('Are you sure you want to stop?') && handleStop();
              }}
            >
              <div className="h-4 w-4 flex items-center justify-center self-center relative">
                <Loader className="w-4 h-4 animate-spin shrink-0 absolute top-0 left-0 opacity-100 group-hover:opacity-0 transition-opacity duration-300 ease-in-out" />
                <Square className="w-3 h-3 fill-foreground shrink-0 absolute opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-in-out" />
              </div>

              {isLoaded && (
                <div className="group-hover:opacity-100 transition-opacity duration-200 delay-0 group-hover:delay-500 overflow-hidden">
                  <span className="pl-2 font-bold font-mono tracking-wide uppercase whitespace-nowrap opacity-0">
                    {status === 'analyzing'
                      ? 'Analyzing...'
                      : status === 'generating'
                        ? 'Generating...'
                        : status === 'evaluating'
                          ? 'Evaluating...'
                          : 'Processing...'}
                  </span>
                </div>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-50">Stop Pipeline</TooltipContent>
        </Tooltip>
      )}
    </>,
    slot,
  );
}