import type { CSSProperties } from "react";
import type { Genre } from "@/lib/genres";
import { mockupLook } from "@/lib/coverMockup";
import { cn } from "@/lib/utils";

/**
 * A book-cover mockup drawn from the title and the pen name, in the style of the
 * genre. `size="sm"` is a thumbnail for a list; `size="lg"` is the big preview.
 */
export function CoverMockup({
  title,
  author,
  genre,
  size = "lg",
  className,
}: {
  title: string;
  author: string;
  genre: Genre | undefined;
  size?: "sm" | "lg";
  className?: string;
}) {
  const look = mockupLook(genre);
  const large = size === "lg";
  const style: CSSProperties = {
    background: look.background,
    color: look.ink,
    fontFamily: look.fontFamily,
  };
  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] flex-col items-center justify-between overflow-hidden rounded-sm text-center shadow-md ring-1 ring-black/10",
        large ? "w-56 px-6 py-8" : "w-24 px-2 py-3",
        className,
      )}
      style={style}
      role="img"
      aria-label={`Cover mockup: ${title || "Untitled"} by ${author || "the author"}`}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: look.accent }}
        aria-hidden="true"
      />
      <p
        className={cn("mt-4 font-semibold leading-tight", look.uppercase && "uppercase tracking-wide", large ? "text-2xl" : "text-[10px]")}
      >
        {title.trim() || "Untitled"}
      </p>
      <p
        className={cn("font-medium", look.uppercase && "uppercase tracking-widest", large ? "text-sm" : "text-[8px]")}
        style={{ color: look.accent }}
      >
        {author.trim() || "Your pen name"}
      </p>
    </div>
  );
}
