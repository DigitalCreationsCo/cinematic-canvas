import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "#client/lib/utils.js"

const buttonVariants = cva(
  "flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all duration-50" +
  "hover:text-foreground btn-cinematic rounded-none transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary hover-elevate active-elevate-2 text-primary-foreground",
        destructive:
          "bg-destructive hover-elevate active-elevate-2 text-destructive-foreground",
        outline:
          "ring-1 ring-border",
        secondary: " bg-secondary hover-elevate active-elevate-2 text-secondary-foreground",
        ghost: "text-muted-foreground hover:text-foreground data-[active=true]:text-foreground no-default-hover-elevate no-default-active-elevate",
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
