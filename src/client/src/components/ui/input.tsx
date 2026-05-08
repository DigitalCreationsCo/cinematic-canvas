import * as React from "react";

import { cn } from "#client/lib/utils.js";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // h-9 to match icon buttons and default buttons.
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full px-3 py-2 border border-border bg-input file:bg-transparent font-medium file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 inset-0 active:ring-none active:outline-none focus:ring-none focus:outline-none focus:border-elevate-2",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
