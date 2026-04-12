// src/client/src/components/Header.tsx
import { useAuth } from '#client/lib/auth-context.js';
import { apiFetch } from '#client/lib/api.js';
import useSWR from 'swr';
import { ThemeButton } from '#client/components/ThemeButton.js';
import { BadgeIcon, MessageSquare } from '#client/components/BadgeIcon.js';
import { useCanvasUIStore } from '#client/store/useCanvasUIStore.js';
import { usePipelineStore } from '#client/store/usePipelineStore.js';
import { Button } from '#client/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '#client/components/ui/tooltip.js';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Badge } from '#client/components/ui/badge.js';

const fetcher = (url: string) => apiFetch(url);

const TeamSwitcher = () => {
    const { activeTeamId, setActiveTeamId } = useAuth();
    const { data, error } = useSWR('/teams', fetcher);
    if (error) return <div>Failed to load teams</div>;
    if (!data) return <div>Loading teams...</div>;
    const { teams } = data;

    return (
        <select
            value={activeTeamId || ''}
            onChange={(e) => setActiveTeamId(e.target.value)}
            className="tracking-wide w-60 h-9 ml-2 px-3 border rounded-none text-sm"
        >
            <option value="">Select a team</option>
            {teams.map((team: any) => (
                <option key={team.id} value={team.id}>
                    {team.name}
                </option>
            ))}
        </select>
    );
};

const Header = () => {
    const toggleMessagesSidebar = useCanvasUIStore(s => s.toggleMessagesSidebar);
    const isMessagesSidebarOpen = useCanvasUIStore(s => s.messagesSidebarOpen);
    const messages = usePipelineStore((s) => s.events);

    // ── Slider state ────────────────────────────────────────────────────────
    const groupRef = useRef<HTMLDivElement>(null);
    const [hoverRect, setHoverRect] = useState({ opacity: 0, width: 0, left: 0 });

    // ── RAF-based continuous tracking ────────────────────────────────────────
    const hoveredButtonRef = useRef<HTMLElement | null>(null);
    const rafRef = useRef<number | null>(null);

    const syncRect = useCallback(() => {
        const btn = hoveredButtonRef.current;
        const container = groupRef.current;

        if (!btn || !container) return;

        const tRect = btn.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();

        setHoverRect({
            opacity: 1,
            width: tRect.width,
            left: tRect.left - cRect.left,
        });

        rafRef.current = requestAnimationFrame(syncRect);
    }, []);

    const startTracking = useCallback((element: HTMLElement) => {
        hoveredButtonRef.current = element;

        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
        }
        rafRef.current = requestAnimationFrame(syncRect);
    }, [syncRect]);

    const stopTracking = useCallback(() => {
        hoveredButtonRef.current = null;

        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }

        setHoverRect(prev => ({ ...prev, opacity: 0 }));
    }, []);

    // ── Single native listener on the group div ──────────────────────────────
    //
    // WHY ONE LISTENER ON THE GROUP (not separate listeners on slot/button):
    //
    // 1. React portals bubble through the *React* tree, not the DOM tree.
    //    A React `onMouseMove` on the slot div never fires for the portaled
    //    AgentToolbar buttons (they live in CanvasToolbar's React tree).
    //    Native DOM events bubble through the DOM tree, so all descendants
    //    of the group div — including portaled buttons — are covered.
    //
    // 2. Scoping the listener to the group div (rather than the slot div)
    //    means `closest('button')` resolves correctly for ALL buttons in the
    //    group: both portaled (AgentToolbar) and non-portaled (Messages).
    //    The slot-scoped listener had a blind spot: events from the Messages
    //    button didn't reach it, causing tracking to lag when moving between
    //    them and leaving the slider stuck too far left or right.
    //
    // 3. `mouseleave` on the group div is the canonical way to detect the
    //    cursor exiting the whole pill. React's synthetic onMouseLeave uses
    //    delegated `mouseout` filtering, which can miss exits when portals
    //    are involved. Native `mouseleave` fires reliably on the element
    //    itself with no bubbling and no delegation issues.
    //
    // When cursor is between buttons (over the group background), `closest`
    // returns null → we don't update → RAF keeps the slider on the last
    // button until the cursor enters the next one. Clean and correct.
    useEffect(() => {
        const group = groupRef.current;
        if (!group) return;

        const handleMouseMove = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest<HTMLElement>('button');
            if (!target) return; // cursor is over group background — hold position
            if (target !== hoveredButtonRef.current) {
                startTracking(target);
            }
        };

        group.addEventListener('mousemove', handleMouseMove);
        group.addEventListener('mouseleave', stopTracking);

        return () => {
            group.removeEventListener('mousemove', handleMouseMove);
            group.removeEventListener('mouseleave', stopTracking);
        };
    }, [startTracking, stopTracking]);

    // Clean up the RAF loop on unmount.
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return (
        <header className="px-4 h-12 bg-accent border-b flex justify-between items-center shrink-0">
            <TeamSwitcher />

            <div className="flex-1 px-4 flex justify-end">
                {/* Canvas toolbar portal target */}
                <div id="canvas-toolbar-slot" className='flex flex-1' />

                <TooltipProvider>
                    {/*
                     * ── The Group ────────────────────────────────────────────────────────
                     * Coordinate origin for the slider. All mouse tracking is handled by
                     * native DOM listeners in the useEffect above — no React event props
                     * needed here.
                     */}
                    <div
                        ref={groupRef}
                        className="relative flex items-center rounded-none p-1 agent-button"
                    >
                        {/*
                         * ── The Slider (Level 0) ─────────────────────────────────────────
                         * pointer-events: none — prevents the slider from intercepting
                         * mouse events and causing a flicker loop.
                         *
                         * Transitions:
                         *  • `left`  — 150ms ease: produces the "slide between elements"
                         *    effect. RAF sets a stable target while CSS animates toward it.
                         *  • `width` — NO transition. RAF drives width at 60fps so it
                         *    tracks the 50ms button-expand animation with zero lag. Adding
                         *    a CSS transition here would make the slider visibly trail the
                         *    button's growing edge.
                         *  • `opacity` — 150ms ease-out: clean fade in/out on enter/leave.
                         */}
                        <div
                            className="absolute inset-y-1 bg-white/20 rounded-none pointer-events-none z-0"
                            style={{
                                left: `${hoverRect.left}px`,
                                width: `${hoverRect.width}px`,
                                opacity: hoverRect.opacity,
                                transition: 'left 150ms ease, opacity 150ms ease-out',
                            }}
                        />

                        {/*
                         * ── Agent Toolbar Slot (Level 10) ───────────────────────────────
                         * Portal target for AgentToolbar. No event handlers here —
                         * the group-level native listener above handles everything.
                         */}
                        <div
                            id="agent-toolbar-slot"
                            className='flex items-center z-10'
                            style={{ order: -1 }}
                        />

                        {/* ── Messages Button (Level 10) ──────────────────────────────── */}
                        {/* No onMouseEnter needed — group-level native mousemove handles it */}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    data-active={isMessagesSidebarOpen}
                                    onClick={toggleMessagesSidebar}
                                    className="relative z-10 w-8 h-8 shrink-0 flex items-center justify-center rounded-full hover:text-background data-[active=true]:text-background"
                                    style={{ order: 0 }}
                                >
                                    <Badge className="text-[12px]" data-testid="logs-count">{messages.length}</Badge>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="z-50">Messages</TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
            </div>

            <div className="flex items-center gap-2">
                <ThemeButton />
            </div>
        </header>
    );
};

export default Header;