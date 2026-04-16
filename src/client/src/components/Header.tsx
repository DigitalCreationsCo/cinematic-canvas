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
import { MessageCircle } from 'lucide-react';

import styles from './Header.module.css';
import { cn } from '#client/lib/utils.js';

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

/**
 * ── Header Component ─────────────────────────────────────────────────────
 */
const Header = () => {
    // Retaining your state management
    const toggleMessagesSidebar = useCanvasUIStore(s => s.toggleMessagesSidebar);
    const isMessagesSidebarOpen = useCanvasUIStore(s => s.messagesSidebarOpen);
    const messages = usePipelineStore((s) => s.events);

    const WATER_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

    const groupRef = useRef<HTMLDivElement>(null);
    const sliderRef = useRef<HTMLDivElement>(null);
    const hoveredButtonRef = useRef<HTMLElement | null>(null);
    const rafRef = useRef<number | null>(null);

    // ── 2: Randomized Gradient Logic ──────────────────────────────────────
    const getNewLiquidGradient = (position: string) => {
        const h = Math.floor(Math.random() * 30) + 100;
        const s = Math.floor(Math.random() * 20) + 20;  // 70-90% saturation
        // We use a larger radius (70%) and HSLA for soft "water" edges
        return `radial-gradient(70% 70% at ${position}, hsla(${h}, ${s}%, 50%, 1) 0%, hsla(${h}, ${s}%, 30%, 1) 30%)`;
    };

    /**
 * Generates a randomized coordinate pair for CSS positioning.
 * Used to shift the focal point of the liquid underlay.
 */
    const getNewObjectPosition = useCallback(() => {
        // We expand the range to -20% to 120% so the "center" of the glow
        // can actually sit outside the button, creating an edge-lighting effect.
        const x = Math.floor(Math.random() * 140) - 20;
        const y = Math.floor(Math.random() * 140) - 20;

        return `${x}% ${y}%`;
    }, []);

    const syncRect = useCallback(() => {
        const btn = hoveredButtonRef.current;
        const container = groupRef.current;
        const slider = sliderRef.current;

        if (!btn || !container || !slider) return;

        const tRect = btn.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();

        // High-performance style updates (60fps safe)
        slider.style.width = `${tRect.width}px`;
        slider.style.height = `${tRect.height}px`;
        slider.style.transform = `translateX(${tRect.left - cRect.left}px) scaleY(1)`;

        rafRef.current = requestAnimationFrame(syncRect);
    }, []);

    const startTracking = useCallback((element: HTMLElement) => {
        // 3: Handle Icon Fill state via Data Attribute
        if (hoveredButtonRef.current) hoveredButtonRef.current.removeAttribute('data-hovered');
        element.setAttribute('data-hovered', 'true');

        hoveredButtonRef.current = element;

        if (sliderRef.current) {
            // 1: Opacity 0 -> 1
            sliderRef.current.style.opacity = '1';

            // Ensure transitions are active for the slide/grow
            sliderRef.current.style.transition = `
                transform 450ms ${WATER_EASE}, 
                width 450ms ${WATER_EASE}, 
                opacity 300ms ease-out
            `;
        }
        rafRef.current = requestAnimationFrame(syncRect);
    }, [syncRect]);

    const stopTracking = useCallback(() => {
        if (hoveredButtonRef.current) {
            hoveredButtonRef.current.removeAttribute('data-hovered');
            hoveredButtonRef.current = null;
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        if (sliderRef.current) {
            // recede the underlay
            sliderRef.current.style.opacity = '0';
            const currentX = sliderRef.current.style.transform.split('scaleY')[0];
            sliderRef.current.style.transform = `${currentX} scaleY(0)`;

            // RECALCULATE FOR NEXT ENTRY
            const nextPos = getNewObjectPosition();

            // Apply the new position and gradient flavor
            sliderRef.current.style.background = getNewLiquidGradient(nextPos);

            // Make the background larger than the slider so the "splash" 
            // feels like it has volume beyond the button borders.
            sliderRef.current.style.backgroundSize = '200% 200%';
        }
    }, [getNewObjectPosition]);

    // ── Native Event Delegation ─────────────────────────────────────────────
    useEffect(() => {
        const group = groupRef.current;
        if (!group) {
            console.warn('[Header] Event delegation failed: groupRef is null.');
            return;
        }

        const handleMouseMove = (e: MouseEvent) => {
            try {
                const targetElement = (e.target as HTMLElement).closest<HTMLElement>('button');

                // Only update if we hit a button and it's different from the current one
                if (targetElement && targetElement !== hoveredButtonRef.current) {
                    startTracking(targetElement);
                }

                // CRITICAL: We no longer call stopTracking() if targetElement is null.
                // This keeps the underlay active in the "gaps," allowing the next 
                // button hover to trigger a 'transform' shift instead of a fade-in.
            } catch (error) {
                console.error('[Header Error]: handleMouseMove encountered an issue.', error);
            }
        };

        group.addEventListener('mousemove', handleMouseMove);
        group.addEventListener('mouseleave', stopTracking);

        return () => {
            group.removeEventListener('mousemove', handleMouseMove);
            group.removeEventListener('mouseleave', stopTracking);
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    }, [startTracking, stopTracking]);

    return (
        <header className="relative z-50 pl-4 h-12 bg-accent border-b flex justify-between items-center shrink-0">
            <TeamSwitcher />

            <div className="flex-1 pl-4 flex justify-end">
                <div id="canvas-toolbar-slot" className="flex flex-1" />

                <div
                    ref={groupRef}
                    className={cn(styles.toolbarGroup, "relative flex items-center rounded-none p-1 overflow-hidden")}
                >
                    {/* * Slider element driven entirely by CSS vars. 
                          * Transitions are managed dynamically by the JS hook. 
                          */}
                    {/* <div
                        ref={sliderRef}
                        className="group/slider absolute inset-y-1 left-0 agent-button rounded-md pointer-events-none z-0"
                        style={{
                            opacity: 0,
                            height: 0,
                            width: '0px',
                            transition: `
            transform 400ms ${WATER_EASE}, 
            width 400ms ${WATER_EASE}, 
            opacity 200ms linear,
            scale 400ms ${WATER_EASE}
        `,
                            transform: 'translateX(0px) scale(0.98)',
                            willChange: 'transform, width, height, opacity'
                        }}
                    /> */}
                    <div
                        ref={sliderRef}
                        className="group/slider absolute inset-y-1 left-0 agent-button rounded-md pointer-events-none z-0"
                        style={{
                            opacity: 0,
                            height: '0px',
                            width: '0px',
                            transform: 'scaleY(0)',
                            transformOrigin: 'bottom',
                            transition: `
            transform 400ms ${WATER_EASE}, 
            width 400ms ${WATER_EASE}, 
            opacity 200ms linear,
            scale 400ms ${WATER_EASE}
        `,
                            objectPosition: getNewObjectPosition(),
                            willChange: 'transform, width, opacity',
                        }}
                    />

                    <div
                        id="agent-toolbar-slot"
                        className="flex items-center gap-4 z-10"
                        style={{ order: -1 }}
                    />

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                size="icon"
                                variant="ghost"
                                data-active={isMessagesSidebarOpen}
                                onClick={toggleMessagesSidebar}
                                className="group relative px-6 z-10 w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground data-[active=true]:text-foreground"
                                style={{ order: 0 }}
                            >
                                <BadgeIcon
                                    icon={MessageCircle}
                                    count={messages?.length || 0}
                                    iconClassName="w-5.4! h-5.4!"
                                />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent className="z-50">Open Chat</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            <div className="flex items-center gap-1 border-l border-border pl-1">
                <ThemeButton />
            </div>
        </header>
    );
};

export default Header;