import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import React, { useCallback, useState } from "react";

interface StartModalProps {
  isOpen: boolean;
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
}

interface ActionButtonProps {
  label: string;
  action: "new-world" | "load-world" | "project";
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
  image: string;
  hoverImage: string;
  posImage: string;
}

// const ActionButton: React.FC<ActionButtonProps> = React.memo(({
//   label, action, image, hoverImage, onSelectAction, posImage
// }) => {
//   const handleClick = useCallback(() => onSelectAction(action), [onSelectAction, action]);

//   // 'idle' -> 'active' (hover confirmed) -> 'exiting' (mouseout)
//   const [status, setStatus] = useState<'idle' | 'active' | 'exiting'>('idle');

//   const handleMouseEnter = useCallback(() => {
//     // We set status to active; however, CSS will ensure visibility 
//     // only if the Button component also applies .is-animating
//     setStatus('active');
//   }, []);

//   const handleMouseLeave = useCallback(() => {
//     setStatus('exiting');
//   }, []);

//   const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
//     // Only reset to idle if we just finished an exit animation
//     if (e.animationName === 'sweep-exit-down') {
//       setStatus('idle');
//     }
//   }, []);

//   return (
//     <Button
//       variant="outline"
//       // Note: "lock-animation" enables the logic in button.tsx
//       className="lock-animation group relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden border-0.5 transition-all hover:border-primary"
//       animationClass="is-animating"
//       restartThreshold={0.4}
//       onClick={handleClick}
//       onMouseEnter={handleMouseEnter}
//       onMouseLeave={handleMouseLeave}
//     >
//       <style>{`
//         @keyframes sweep-enter-down {
//           0% { -webkit-mask-position: 0% 0%; mask-position: 0% 0%; }
//           100% { -webkit-mask-position: 0% 50%; mask-position: 0% 50%; }
//         }
//         @keyframes sweep-exit-down {
//           0% { -webkit-mask-position: 0% 50%; mask-position: 0% 50%; }
//           100% { -webkit-mask-position: 0% 100%; mask-position: 0% 100%; }
//         }

//         .mask-layer {
//           -webkit-mask-image: linear-gradient(172deg, transparent 0%, transparent 30%, black 35%, black 65%, transparent 70%, transparent 100%);
//           mask-image: linear-gradient(172deg, transparent 0%, transparent 30%, black 35%, black 65%, transparent 70%, transparent 100%);
//           -webkit-mask-size: 100% 300%;
//           mask-size: 100% 300%;
//           -webkit-mask-position: 0% 0%;
//           mask-position: 0% 0%;
//           opacity: 0; /* Hidden by default */
//           pointer-events: none;
//         }

//         /* Logic Gate 1: Only show image if the Button is actually animating OR we are in exit phase */
//         .is-animating .mask-layer,
//         .mask-layer.is-exiting {
//           opacity: 1;
//         }

//         /* Logic Gate 2: If we are 'active' (hovered) and the animation finished, keep it visible */
//         .mask-layer.is-active:not(.is-exiting) {
//           opacity: 1;
//           -webkit-mask-position: 0% 50%;
//           mask-position: 0% 50%;
//         }

//         /* Animations */
//         .is-animating .mask-layer:not(.is-exiting) {
//           animation: sweep-enter-down 0.5s ease-out forwards;
//         }

//         .mask-layer.is-exiting {
//           animation: sweep-exit-down 0.6s ease-in forwards;
//         }
//       `}</style>

//       <img
//         src={image}
//         alt=""
//         className={`absolute inset-0 h-full w-full object-cover -z-20 opacity-60 transition-transform duration-700 group-hover:scale-105 ${posImage}`}
//       />

//       <img
//         src={hoverImage}
//         alt={label}
//         onAnimationEnd={handleAnimationEnd}
//         className={`mask-layer absolute inset-0 h-full w-full object-cover -z-10 ${posImage} ${status === 'active' ? 'is-active' : ''
//           } ${status === 'exiting' ? 'is-exiting' : ''
//           }`}
//       />

//       <div className="relative z-10 text-center">
//         <span className="font-mono text-xs uppercase text-primary transition-all duration-300 group-hover:text-secondary">
//           {label}
//         </span>
//       </div>
//     </Button>
//   );
// });

const ActionButton: React.FC<ActionButtonProps> = React.memo(({
  label, action, image, hoverImage, onSelectAction, posImage
}) => {
  const handleClick = useCallback(() => onSelectAction(action), [onSelectAction, action]);

  const [status, setStatus] = useState<'idle' | 'active' | 'exiting'>('idle');

  const handleMouseEnter = useCallback(() => {
    setStatus('active');
  }, []);

  const handleMouseLeave = useCallback(() => {
    setStatus('exiting');
  }, []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent) => {
    // Only reset to idle if we just finished an exit animation
    // if (e.animationName === 'sweep-enter-down') {
    //   setStatus('exiting');
    // }
  }, []);

  return (
    <Button
      variant="outline"
      className="lock-animation aspect-[8/16] group relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden border-0.5 transition-all hover:border-primary"
      animationClass="is-animating"
      restartThreshold={0.8}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <style>{`
        @keyframes sweep-enter-down {
          0% { -webkit-mask-position: 0% 0%; mask-position: 0% 0%; }
          100% { -webkit-mask-position: 0% 50%; mask-position: 0% 50%; }
        }
        @keyframes sweep-exit-down {
          0% { -webkit-mask-position: 0% 50%; mask-position: 0% 50%; }
          100% { -webkit-mask-position: 0% 100%; mask-position: 0% 100%; }
        }
        
        .mask-layer {
          -webkit-mask-image: linear-gradient(172deg, transparent 0%, transparent 30%, black 35%, black 65%, transparent 70%, transparent 100%);
          mask-image: linear-gradient(172deg, transparent 0%, transparent 30%, black 35%, black 65%, transparent 70%, transparent 100%);
          -webkit-mask-size: 100% 300%;
          mask-size: 100% 300%;
          -webkit-mask-position: 0% 0%;
          mask-position: 0% 0%;
          transition: opacity 0.15s ease;
          opacity: 0;
          pointer-events: none;
        }

        .is-animating .mask-layer {
          opacity: 1;
          animation: sweep-enter-down 0.5s ease-out forwards;
        }

        .mask-layer.is-active:not(.is-exiting) {
          opacity: 1;
          -webkit-mask-position: 0% 50%;
          mask-position: 0% 50%;
        }

        .is-animating .mask-layer:not(.is-exiting) {
          animation: sweep-enter-down 0.5s ease-out forwards;
        }

        .mask-layer.is-exiting {
          animation: sweep-exit-down 0.6s ease-in forwards;
        }

        .mask-layer:not(.state-hovered) {
          animation: sweep-exit-down 0.5s ease-in forwards;
        }

        .Button:not(.is-animating) .mask-layer:not(.state-hovered) {
          opacity: 0;
          transition-delay: 0.5s; /* Wait for exit animation to clear visibility */
        }
      `}</style>

      {/* Base Wireframe */}
      <img
        src={image}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover -z-20 opacity-60 transition-transform duration-700 group-hover:scale-105 ${posImage}`}
      />

      {/* Mask Layer */}
      <img
        src={hoverImage}
        alt={label}
        onAnimationEnd={handleAnimationEnd}
        className={`mask-layer absolute inset-0 h-full w-full object-cover -z-10 ${posImage} ${status === 'active' ? 'is-active' : ''
          } ${status === 'exiting' ? 'is-exiting' : ''
          }`}
      />

      <div className="relative z-10 text-center pointer-events-none">
        <span className="font-mono text-xs uppercase text-primary transition-all duration-300">
          {label}
        </span>
      </div>
    </Button>
  );
});

ActionButton.displayName = "ActionButton";

export const StartModal: React.FC<StartModalProps> = React.memo(({ isOpen, onSelectAction }) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent
        hideCloseButton
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="card-cinematic-glass sm:max-w-5xl px-24 pt-12 pb-20"
        overlayClassName="bg-transparent"
      >
        <DialogHeader className="my-8 items-center text-center">
          <DialogTitle className="text-3xl uppercase font-heading mb-2 text-foreground/80">Welcome to Cinematic Canvas</DialogTitle>
          <DialogDescription className="text-base">
            How would you like to begin?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <ActionButton
            label="Load a cinematic project"
            action="project"
            onSelectAction={onSelectAction}
            image={""}
            hoverImage={""}
            posImage={"object-[50%_50%]"}
          />
          <ActionButton
            label="Dream a new world"
            action="new-world"
            onSelectAction={onSelectAction}
            image={"/dream-world-wire.png"}
            hoverImage={"/dream-world.png"}
            posImage={"object-[15%_50%]"}
          />
          <ActionButton
            label="Explore an existing world"
            action="load-world"
            onSelectAction={onSelectAction}
            image={""}
            hoverImage={""}
            posImage={"object-[50%_50%]"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
});

StartModal.displayName = "StartModal";