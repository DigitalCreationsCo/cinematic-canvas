import * as React from "react"

import { cn } from "#/lib/utils.js"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full    bg-background px-3 py-2   file: file:bg-transparent file: file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible: focus-visible: focus-visible: focus-visible: disabled:cursor-not-allowed disabled:opacity-50 md:",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
