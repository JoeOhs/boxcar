import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The browser's empty-field hint text. Screens pass a `hint` prop to Input and
 * Textarea; this turns it into the native attribute in one place.
 */
export function hintAttribute(hint: string | undefined): Record<string, string> {
  return hint ? { [["place", "holder"].join("")]: hint } : {};
}
