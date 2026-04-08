import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "#client/components/ui/dialog.js";
import { Button } from "#client/components/ui/button.js";
import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from 'framer-motion';

interface StartModalProps {
  isOpen: boolean;
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
}

// const ActionButton: React.FC<ActionButtonProps> = React.memo(({ label, action, image, hoverImage, onSelectAction, posImage }) => {
//   const handleClick = useCallback(() => onSelectAction(action), [onSelectAction, action]);
//   const [isHover, setIsHover] = useState(false);

//   return (
//     <Button
//       variant="outline"
//       className="group relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden border-0.5 transition-all hover:border-primary"
//       onClick={handleClick}
//       onMouseEnter={() => setIsHover(true)}
//       onMouseLeave={() => setIsHover(false)}
//     >
//       {/* Base Image: Always rendered */}
//       <img
//         src={image}
//         alt=""
//         className={`absolute inset-0 h-full w-full object-cover -z-20 transition-opacity duration-500 ${posImage} ${isHover ? 'opacity-0' : 'opacity-60'}`}
//       />

//       {/* Hover Image: Always rendered, layered on top */}
//       <img
//         src={hoverImage}
//         alt={label}
//         className={`absolute inset-0 h-full w-full object-cover -z-10 transition-all duration-700 ease-out ${posImage} ${isHover ? 'opacity-100 scale-105' : 'opacity-0 scale-100'}`}
//       />

//       <div className="relative z-10 text-center">
//         <span className="font-mono text-xs uppercase text-primary transition-all duration-300 group-hover:text-secondary group-hover:tracking-widest">
//           {label}
//         </span>
//       </div>
//     </Button>
//   );
// });

interface ActionButtonProps {
  label: string;
  action: "new-world" | "load-world" | "project";
  onSelectAction: (action: "new-world" | "load-world" | "project") => void;
  image: string;
  hoverImage: string;
  posImage: string;
}

const ActionButton: React.FC<ActionButtonProps> = React.memo(({ label, action, image, hoverImage, onSelectAction, posImage }) => {
  const handleClick = useCallback(() => onSelectAction(action), [onSelectAction, action]);
  const [animationState, setAnimationState] = useState<'idle' | 'revealing' | 'exiting'>('idle');

  const handleMouseEnter = () => setAnimationState('revealing');
  const handleMouseLeave = () => setAnimationState('exiting');

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    // Once the exit sweep completes, hide the mask layer entirely
    if (e.animationName === 'sweep-exit-down') {
      setAnimationState('idle');
    }
  };

  return (
    <Button
      variant="outline"
      className="group relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden border-0.5 transition-all hover:border-primary"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <style>{`
        @keyframes sweep-enter-down {
          from { -webkit-mask-position: 0% 0%; mask-position: 0% 0%; }
          to { -webkit-mask-position: 0% 50%; mask-position: 0% 50%; }
        }
        @keyframes sweep-exit-down {
          from { -webkit-mask-position: 0% 50%; mask-position: 0% 50%; }
          to { -webkit-mask-position: 0% 100%; mask-position: 0% 100%; }
        }
        .mask-layer {
          /* Reversed angle: left side is now lower, right side is higher for a top-down sweep */
          -webkit-mask-image: linear-gradient(172deg, transparent 0%, transparent 30%, black 35%, black 65%, transparent 70%, transparent 100%);
          mask-image: linear-gradient(172deg, transparent 0%, transparent 30%, black 35%, black 65%, transparent 70%, transparent 100%);
          -webkit-mask-size: 100% 300%;
          mask-size: 100% 300%;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          opacity: 0; /* Hidden by default */
        }
        .animate-reveal { opacity: 1; animation: sweep-enter-down 0.5s ease-out forwards; }
        .animate-exit { opacity: 1; animation: sweep-exit-down 0.7s ease-in forwards; }
      `}</style>

      {/* Base Texture */}
      <img
        src={image}
        alt=""
        className={`absolute inset-0 h-full w-full object-cover -z-20 opacity-60 transition-transform duration-700 ${posImage} ${animationState === 'revealing' ? 'scale-105' : 'scale-100'}`}
      />

      {/* Sliding Window Layer */}
      <img
        src={hoverImage}
        alt={label}
        onAnimationEnd={handleAnimationEnd}
        className={`absolute inset-0 h-full w-full object-cover -z-10 mask-layer ${posImage} ${animationState === 'revealing' ? 'animate-reveal' :
          animationState === 'exiting' ? 'animate-exit' : ''
          }`}
      />

      <div className="relative z-10 text-center">
        <span className="font-mono text-xs uppercase text-primary transition-all duration-300 group-hover:text-secondary group-hover:tracking-widest">
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
        className="rounded-none card-cinematic-glass sm:max-w-5xl px-24 py-12"
        overlayClassName="bg-transparent"
      >
        <DialogHeader className="my-8 items-center text-center">
          <DialogTitle className="text-4xl font-heading uppercase mb-2 text-foreground/80">Welcome to Cinematic Canvas</DialogTitle>
          <DialogDescription className="text-base">
            How would you like to begin?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-120">
          <ActionButton
            label="Load a cinematic project"
            action="project"
            onSelectAction={onSelectAction}
            image={"/load-project.png"}
            hoverImage={"/load-project.png"}
            posImage={"object-[50%_50%]"}
          />
          <ActionButton
            label="Dream a new world"
            action="new-world"
            onSelectAction={onSelectAction}
            image={"/dream-world-wire.png"}
            hoverImage={"/dream-world.png"}
            posImage={"object-[20%_50%]"}
          />
          <ActionButton
            label="Explore an existing world"
            action="load-world"
            onSelectAction={onSelectAction}
            image={"/explore-world-wire.png"}
            hoverImage={"/explore-world.png"}
            posImage={"object-[50%_50%]"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
});

StartModal.displayName = "StartModal";