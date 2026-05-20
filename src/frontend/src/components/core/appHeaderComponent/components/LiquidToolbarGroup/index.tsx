import { ReactNode, useCallback, useEffect, useRef } from "react";
import { cn } from "@/utils/utils";
import styles from "./Header.module.css";

const LIQUID_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

interface LiquidToolbarGroupProps {
  children: ReactNode;
  className?: string;
}

export const LiquidToolbarGroup = ({
  children,
  className,
}: LiquidToolbarGroupProps) => {
  const groupRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const hoveredButtonRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const getNewLiquidGradient = (position: string) => {
    const h = Math.floor(Math.random() * 30) + 100;
    const s = Math.floor(Math.random() * 20) + 20;
    return `radial-gradient(70% 70% at ${position}, hsla(${h}, ${s}%, 50%, 1) 0%, hsla(${h}, ${s}%, 30%, 1) 30%)`;
  };

  const getNewObjectPosition = useCallback(() => {
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

    slider.style.width = `${tRect.width}px`;
    slider.style.height = `${tRect.height}px`;
    slider.style.transform = `translateX(${tRect.left - cRect.left}px) scaleY(1)`;

    rafRef.current = requestAnimationFrame(syncRect);
  }, []);

  const startTracking = useCallback(
    (element: HTMLElement) => {
      if (hoveredButtonRef.current)
        hoveredButtonRef.current.removeAttribute("data-hovered");

      element.setAttribute("data-hovered", "true");
      hoveredButtonRef.current = element;

      if (sliderRef.current) {
        sliderRef.current.style.opacity = "1";
        sliderRef.current.style.transition = `
            transform 200ms ${LIQUID_EASE},
            width 200ms ${LIQUID_EASE},
            opacity 200ms ease-out
        `;
      }
      rafRef.current = requestAnimationFrame(syncRect);
    },
    [syncRect],
  );

  const stopTracking = useCallback(() => {
    if (hoveredButtonRef.current) {
      hoveredButtonRef.current.removeAttribute("data-hovered");
      hoveredButtonRef.current = null;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (sliderRef.current) {
      sliderRef.current.style.opacity = "0";
      const currentX = sliderRef.current.style.transform.split("scaleY")[0];
      sliderRef.current.style.transform = `${currentX} scaleY(0)`;

      const nextPos = getNewObjectPosition();
      sliderRef.current.style.background = getNewLiquidGradient(nextPos);
      sliderRef.current.style.backgroundSize = "200% 200%";
    }
  }, [getNewObjectPosition]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const handleMouseMove = (e: MouseEvent) => {
      try {
        const targetElement = (e.target as HTMLElement).closest<HTMLElement>(
          "button",
        );
        if (targetElement?.hasAttribute("data-no-header-track")) return;

        if (targetElement && targetElement !== hoveredButtonRef.current) {
          startTracking(targetElement);
        }
      } catch (error) {
        console.error(
          "[LiquidToolbar Error]: handleMouseMove encountered an issue.",
          error,
        );
      }
    };

    group.addEventListener("mousemove", handleMouseMove);
    group.addEventListener("mouseleave", stopTracking);

    return () => {
      group.removeEventListener("mousemove", handleMouseMove);
      group.removeEventListener("mouseleave", stopTracking);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [startTracking, stopTracking]);

  return (
    <div
      ref={groupRef}
      className={cn(
        styles.toolbarGroup,
        "relative flex items-center rounded-none p-1",
        className,
      )}
    >
      <div
        ref={sliderRef}
        className="group/slider absolute inset-y-1 left-0 agent-button rounded-md pointer-events-none z-0"
        style={{
          opacity: 0,
          height: "0px",
          width: "0px",
          transform: "scaleY(0)",
          transformOrigin: "bottom",
          transition: `transform 200ms ${LIQUID_EASE}, width 200ms ${LIQUID_EASE}, opacity 200ms linear, scale 200ms ${LIQUID_EASE}`,
          objectPosition: getNewObjectPosition(),
          willChange: "transform, width, opacity",
        }}
      />
      {/* Ensures child buttons sit above the animated underlay */}
      <div className="flex items-center z-10 w-full gap-1">{children}</div>
    </div>
  );
};
