import * as React from "react";
import { cn, hintAttribute } from "@/lib/utils";

export type TextareaProps = React.ComponentProps<"textarea"> & {
  /** Text shown while the field is empty. */
  hint?: string;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, hint, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...hintAttribute(hint)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
