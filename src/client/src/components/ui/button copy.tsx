"use client";

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '#client/lib/utils.js'

const LOCK_ANIMATION_TRIGGER = 'lock-animation'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive: 'bg-destructive text-white shadow-xs hover:bg-destructive/90',
        outline: 'border bg-background shadow-xs hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-none px-3',
        lg: 'h-10 rounded-none px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ComponentPropsWithRef<'button'>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * The CSS className toggled by JS to drive the keyframe animation.
   * Defaults to 'is-animating'. Only active when 'lock-animation' is also present.
   *
   * Do NOT include this className in the static className — JS manages it entirely.
   */
  animationClass?: string
  /**
   * 0–1 progress threshold after which a new hover restarts the animation.
   * Defaults to 1 (never restart mid-animation).
   *
   * @example restartThreshold={0.75} // hover after 75% → restarts; before → ignored
   */
  restartThreshold?: number
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      animationClass = 'is-animating',
      restartThreshold = 1,
      ...props
    },
    forwardedRef
  ) => {
    const Comp = asChild ? Slot : 'button'
    const buttonRef = React.useRef<HTMLButtonElement>(null)
    const isAnimatingRef = React.useRef(false)

    // Keep latest prop values accessible inside the stable effect closure
    const propsRef = React.useRef({ animationClass, restartThreshold })
    React.useEffect(() => {
      propsRef.current = { animationClass, restartThreshold }
    }, [animationClass, restartThreshold])

    const setRefs = React.useCallback(
      (node: HTMLButtonElement) => {
        buttonRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      [forwardedRef]
    )

    // Run once on mount. propsRef handles any reactive prop changes.
    React.useEffect(() => {
      const button = buttonRef.current
      if (!button || !button.classList.contains(LOCK_ANIMATION_TRIGGER)) return

      // Defensive: strip animationClass if it was accidentally included in
      // the static className. JS is the sole manager of this className.
      button.classList.remove(propsRef.current.animationClass)

      const triggerAnimation = () => {
        const { animationClass: cls } = propsRef.current

        button.classList.remove(cls)
        void button.offsetWidth  // Force reflow so remove+add is not batched
        button.classList.add(cls)
        isAnimatingRef.current = true

        // Grab the Animation instance on the next frame. The animation is on
        // the child span (.btn-text-go-cinematic), not the button itself, so
        // we use subtree:true. The state is 'pending' immediately after the
        // className is added — it becomes 'running' after the first paint.
        requestAnimationFrame(() => {
          // Fix 1: 'pending' not 'paused'. A freshly-triggered animation is
          // 'pending' briefly. Matching only 'running' or 'paused' misses it,
          // causing the lock to be immediately released and threshold ignored.
          const anim = button
            .getAnimations({ subtree: true })
            .find((a) => a instanceof CSSAnimation &&
              (a.playState === 'running' || a.playState === 'paused'));

          if (!anim) {
            // animationClass was added but no animation found — CSS may not
            // define one for this state. Release the lock so button isn't stuck.
            isAnimatingRef.current = false
            return
          }

          // Use the instance's .finished Promise: scoped to exactly this
          // animation, no name matching needed. Rejects on cancel (restart),
          // which we safely ignore — the new call's handler takes over.
          anim.finished
            .then(() => {
              button.classList.remove(propsRef.current.animationClass)
              isAnimatingRef.current = false
            })
            .catch(() => {
              // Cancelled by triggerAnimation() being called again (restart).
              // The new .finished handler takes over — nothing to do here.
            })
        })
      }

      const handleMouseEnter = () => {
        if (!isAnimatingRef.current) {
          triggerAnimation()
          return
        }

        const { restartThreshold: threshold } = propsRef.current

        // Default (threshold === 1): never restart a running animation.
        if (threshold >= 1) return

        // Fix 1 (same): 'pending' must be included here too so an early
        // re-hover doesn't fall through to the stale-state branch and
        // bypass the threshold check entirely.
        const activeAnim = button
          .getAnimations({ subtree: true })
          .find((a) => a instanceof CSSAnimation &&
            (a.playState === 'running' || a.playState === 'paused'));

        if (!activeAnim) {
          // Ref says animating but DOM has no active animation — state is stale.
          // Reset and treat this hover as a fresh start.
          isAnimatingRef.current = false
          triggerAnimation()
          return
        }

        const effect = activeAnim.effect as KeyframeEffect
        const timing = effect.getTiming()
        const duration = typeof timing.duration === 'number' ? timing.duration : 0
        const currentTime = (activeAnim.currentTime as number) ?? 0
        const progress = duration > 0 ? currentTime / duration : 0

        if (progress >= threshold) triggerAnimation()
        // else: below threshold — hover is intentionally ignored
      }

      button.addEventListener('mouseenter', handleMouseEnter)

      return () => {
        button.removeEventListener('mouseenter', handleMouseEnter)
        button.classList.remove(propsRef.current.animationClass)
        isAnimatingRef.current = false
      }
    }, [])

    return (
      <Comp
        ref={setRefs}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'

export { Button, buttonVariants }