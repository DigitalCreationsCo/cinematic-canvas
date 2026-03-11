import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "#/lib/utils.js"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap   font-medium focus-visible: focus-visible: focus-visible: disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
  " hover-elevate active-elevate-2 btn-cinematic",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground  ",
        destructive:
          "bg-destructive text-destructive-foreground  ",
        outline:
          // Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color.
          "  [:var(--button-)] border-1 border-border",
        secondary: " bg-secondary text-secondary-foreground   ",
        // Add a transparent  so that when someone toggles a  on later, it doesn't shift layout/size.
        ghost: "border-1 border-transparent",
      },
      // Heights are set as "min" heights, because sometimes Ai will place large amount of content
      // inside buttons. With a min-height they will look appropriate with small amounts of content,
      // but will expand to fit large amounts of content.
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8  px-3 ",
        lg: "min-h-10  px-8",
        icon: "h-9 w-9 ",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    if (asChild) {
      return (
        <Comp
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...props}
        />
      )
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        <span className="inline-flex items-center justify-center gap-2 w-full h-full">
          {props.children}
        </span>
      </Comp>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
