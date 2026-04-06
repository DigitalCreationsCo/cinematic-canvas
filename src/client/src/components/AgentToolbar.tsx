// src/client/src/components/AgentToolbar.tsx
import { Loader, Play, Square, } from 'lucide-react';
import { Button } from './ui/button.js';
import { usePipelineStore } from '../store/usePipelineStore.js';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { useProjectStore } from '#client/store/useProjectStore.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#client/components/ui/tooltip.js';

interface AgentToolbarProps {
  handleStart: () => void;
  handleResume: () => void;
  handleStop: () => void;
  projectId?: string;
}

/*
 * ── Shared button className ────────────────────────────────────────────────
 *
 * All AgentToolbar buttons share identical geometry and colour rules so they
 * read as one cohesive group inside the emerald pill:
 *
 *  • rounded-full + px-3 h-8  — same pill geometry as the Messages button.
 *  • text-white hover:text-white  — homogenous text colour, never changes.
 *  • hover:bg-transparent  — PASSIVE: the button owns NO hover background.
 *    The slider div in Header provides the bg via the RAF loop.
 *  • overflow-hidden  — required for the max-width label-reveal animation;
 *    clips only the button's own children, not the slider behind it.
 *  • z-10  — sits above the slider (z-0) so click events register correctly.
 */
const BUTTON_CLASS = [
  'group relative flex justify-center items-center bg-white/20',
  'h-8 p-2 px-3 rounded-full',
  'text-white hover:text-white bg-transparent hover:bg-transparent',
  'transition-all delay-400 duration-[200ms] ease-in-out',
  'group-hover:max-w-[120px]',
  'overflow-hidden z-10',
].join(' ');

export function AgentToolbar({ handleStart, handleStop, handleResume, projectId }: AgentToolbarProps) {
  const status = usePipelineStore((s) => s.status);
  const total = useProjectStore((state) => state.scenes.size || 0);
  const [slot, setSlot] = useState<Element | null>(null);

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
              {/* Icon — always visible, never shrinks */}
              <Play className="w-4 h-4 shrink-0" />

              {/*
               * Expandable label — only rendered when a project is loaded.
               * max-w transitions 0 → 120px in 50ms on group-hover.
               * The RAF loop in Header tracks the grow in real time.
               */}
              {isLoaded && (
                <div className="hidden group-hover:inline max-w-0 overflow-hidden">
                  <span className="pl-2 font-bold font-mono tracking-wide uppercase whitespace-nowrap">
                    {total === 0 ? 'Start' : 'Resume'}
                  </span>
                </div>
              )}
            </Button>
          </TooltipTrigger>
          {/* Tooltips are portaled to document.body by Radix — never clipped. */}
          <TooltipContent className="z-50">
            {total === 0 ? 'Start Pipeline' : 'Resume Pipeline'}
          </TooltipContent>
        </Tooltip>
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
              <div className='h-4 w-4 flex items-center justify-center self-center relative '>
                <Loader
                  className="w-4 h-4 animate-spin shrink-0
                absolute top-0 left-0 opacity-100 group-hover:opacity-0
                transition-opacity duration-300 ease-in-out"
                />
                {/* 3. Square: Hidden by default, fades in on group-hover */}
                <Square
                  className="w-3 h-3 fill-foreground shrink-0
                absolute
                opacity-0 group-hover:opacity-100
                transition-opacity duration-300 ease-in-out"
                />
              </div>

              {isLoaded && (
                <div className="group-hover:max-w-max transition-all delay-400 group-hover:delay-0 duration-[200ms] ease-in-out overflow-hidden">
                  <span className="pl-2 font-bold font-mono tracking-wide uppercase whitespace-nowrap">
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