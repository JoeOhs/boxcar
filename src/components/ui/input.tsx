import * as React from "react";
import { cn, hintAttribute } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input"> & {
  /** Text shown while the field is empty. */
  hint?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, hint, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    className={cn(
      "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...hintAttribute(hint)}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
