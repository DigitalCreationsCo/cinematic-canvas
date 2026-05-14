// components/ui/textarea.tsx

import * as React from "react";
import { cn } from "#client/lib/utils.js";

/**
 * Shared base Tailwind classNamees used by both Textarea and MentionTextarea.
 * Exported so MentionTextarea can stay pixel-identical without duplicating strings.
 */
export const textareaBaseClasses =
  "min-h-[80px] w-full px-3 py-2 border border-input placeholder:text-muted-foreground cursor-text disabled:cursor-not-allowed disabled:opacity-50 active:ring-none active:outline-none focus:ring-none focus:outline-none focus:border-border-muted-foreground";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        data-testid="textarea"
        className={cn(textareaBaseClasses, className)}
        ref={ref}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";

export { Textarea };
