import * as React from "react"

import { cn } from "#/lib/utils.js"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full    bg-background px-3 py-2   placeholder:text-muted-foreground focus-visible: focus-visible: focus-visible: focus-visible: disabled:cursor-not-allowed disabled:opacity-50 md:",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
