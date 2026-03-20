import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '#/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'
  const activeAnimationsRef = React.useRef<Animation[]>([])
  const pendingAnimationRef = React.useRef<{
    keyframes: Keyframe[]
    duration: number
    delay: number
    easing: string
    startTime: number | null
  } | null>(null)
  const transitionOverrideRef = React.useRef<{
    timeoutId: NodeJS.Timeout
    savedStyle: string
  } | null>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    return () => {
      activeAnimationsRef.current.forEach((anim) => anim.cancel())
      activeAnimationsRef.current = []
      if (transitionOverrideRef.current) {
        clearTimeout(transitionOverrideRef.current.timeoutId)
      }
    }
  }, [])

  const handleMouseEnter = () => {
    const button = buttonRef.current
    if (!button) return

    if (transitionOverrideRef.current) {
      clearTimeout(transitionOverrideRef.current.timeoutId)
      if (transitionOverrideRef.current.savedStyle) {
        button.style.transition = transitionOverrideRef.current.savedStyle
      }
      transitionOverrideRef.current = null
    }

    const cssAnimations = button.getAnimations()
    if (cssAnimations.length === 0) return

    const cssAnim = cssAnimations[0]
    const effect = cssAnim.effect as KeyframeEffect | null
    if (!effect) return

    const keyframes = effect.getKeyframes()
    const timing = effect.getTiming()
    if (keyframes.length === 0) return

    const duration = typeof timing.duration === 'number' ? timing.duration : 400
    const delay = typeof timing.delay === 'number' ? timing.delay : 0

    pendingAnimationRef.current = {
      keyframes,
      duration,
      delay,
      easing: timing.easing || 'ease',
      startTime: cssAnim.startTime as number | null,
    }
  }

  const handleMouseLeave = () => {
    const button = buttonRef.current
    if (!button) return

    if (transitionOverrideRef.current) {
      clearTimeout(transitionOverrideRef.current.timeoutId)
      transitionOverrideRef.current = null
    }

    const computedStyle = window.getComputedStyle(button)
    const transitionDuration = parseFloat(computedStyle.transitionDuration) || 0

    if (transitionDuration > 0) {
      transitionOverrideRef.current = {
        savedStyle: button.style.transition,
        timeoutId: setTimeout(() => {
          if (buttonRef.current) {
            buttonRef.current.style.transition = transitionOverrideRef.current?.savedStyle || ''
            transitionOverrideRef.current = null
          }
        }, transitionDuration * 1000 + 50),
      }

      button.style.transition = 'none'
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (button && transitionOverrideRef.current) {
            button.style.transition = transitionOverrideRef.current.savedStyle || ''
          }
        })
      })
    }

    if (!pendingAnimationRef.current) return

    const { keyframes, duration, delay, easing, startTime } = pendingAnimationRef.current

    if (startTime === null) {
      pendingAnimationRef.current = null
      return
    }

    const timeline = button.ownerDocument?.timeline?.currentTime
    const animCurrentTime = timeline !== undefined && timeline !== null && startTime !== null
      ? (timeline as number) - (startTime as number) - delay
      : null

    let remaining: number

    if (animCurrentTime !== null && animCurrentTime >= 0) {
      remaining = Math.max(0, duration - animCurrentTime)
    } else {
      remaining = duration + delay
    }

    if (remaining > 0) {
      let partialKeyframes: Keyframe[]
      if (animCurrentTime !== null && animCurrentTime >= 0 && animCurrentTime < duration) {
        const progress = animCurrentTime / duration
        partialKeyframes = generatePartialKeyframes(keyframes, progress)
      } else {
        partialKeyframes = keyframes
      }

      const jsAnim = button.animate(partialKeyframes, {
        duration: remaining,
        easing,
        fill: 'forwards',
      })

      jsAnim.play()
      activeAnimationsRef.current.push(jsAnim)

      jsAnim.onfinish = () => {
        const idx = activeAnimationsRef.current.indexOf(jsAnim)
        if (idx > -1) activeAnimationsRef.current.splice(idx, 1)
      }
    }

    pendingAnimationRef.current = null
  }

  return (
    <Comp
      ref={buttonRef}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    />
  )
}

function generatePartialKeyframes(keyframes: Keyframe[], progress: number): Keyframe[] {
  if (keyframes.length < 2) return keyframes

  const totalFrames = keyframes.length - 1
  const currentFrame = Math.min(Math.floor(progress * totalFrames), totalFrames - 1)
  const frameProgress = (progress * totalFrames) - currentFrame

  const startFrame = keyframes[currentFrame]
  const endFrame = keyframes[currentFrame + 1]

  const result: Keyframe[] = []
  result.push(interpolateKeyframe(startFrame, endFrame, frameProgress))
  result.push(endFrame)

  return result
}

function interpolateKeyframe(start: Keyframe, end: Keyframe, t: number): Keyframe {
  const result: Keyframe = { offset: 1 }

  for (const prop of ['transform', 'filter', 'opacity', 'color', 'backgroundColor', 'borderColor', 'boxShadow']) {
    const startVal = (start as Record<string, unknown>)[prop]
    const endVal = (end as Record<string, unknown>)[prop]

    if (startVal !== undefined && endVal !== undefined) {
      (result as Record<string, unknown>)[prop] = interpolateValue(startVal as string | number, endVal as string | number, t)
    }
  }

  return result
}

function interpolateValue(start: string | number, end: string | number, t: number): string | number {
  if (typeof start === 'number' && typeof end === 'number') {
    return start + (end - start) * t
  }
  return end
}

export { Button, buttonVariants }
