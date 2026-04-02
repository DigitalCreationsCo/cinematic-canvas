import React, { useRef, type ReactNode } from 'react';

interface EventStopperProps {
  children: ReactNode;
  /**
   * Additional class names to apply to the wrapper
   */
  className?: string;
  /**
   * Whether to stop propagation for mouse events (default: true)
   */
  stopMouseEvents?: boolean;
  /**
   * Whether to stop propagation for touch events (default: true)
   */
  stopTouchEvents?: boolean;
}

/**
 * A wrapper component that stops event propagation for mouse and touch events.
 * 
 * This is useful when rendering modals/dialogs inside components that have
 * click-outside handlers (like context menus, dropdowns, etc.).
 * 
 * Without this wrapper, clicking inside the modal would bubble up to the
 * parent component's document listener, potentially closing it prematurely.
 * 
 * @example
 * ```tsx
 * // Inside a component with click-outside handling
 * <EventStopper>
 *   <Modal isOpen={isOpen} onClose={onClose} />
 * </EventStopper>
 * ```
 */
export function EventStopper({
  children,
  className,
  stopMouseEvents = true,
  stopTouchEvents = true,
}: EventStopperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (stopMouseEvents) {
      e.stopPropagation();
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (stopMouseEvents) {
      e.stopPropagation();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (stopMouseEvents) {
      e.stopPropagation();
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (stopTouchEvents) {
      e.stopPropagation();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (stopTouchEvents) {
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  );
}

export default EventStopper;
