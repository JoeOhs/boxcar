import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import type { Genre } from "@/lib/genres";
import { mockupLook } from "@/lib/coverMockup";
import { cn } from "@/lib/utils";

/** A stored picture as a link the browser can show. The link is released when the picture leaves the screen. */
function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url;
}

/** A full-screen view of a cover. Click anywhere, or press Escape, to close it. */
export function ZoomView({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the zoomed view"
        className="absolute right-4 top-4 rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" />
      </button>
      <div className="max-h-full max-w-full">{children}</div>
    </div>
  );
}

/** A picture (for example a cover made by the image AI) that opens full size when clicked. */
export function CoverImage({ image, alt, className }: { image: Blob; alt: string; className?: string }) {
  const url = useObjectUrl(image);
  const [zoomed, setZoomed] = useState(false);
  if (!url) return null;
  return (
    <>
      <button type="button" onClick={() => setZoomed(true)} title="Click to zoom" className="inline-block max-w-full cursor-zoom-in align-top">
        <img src={url} alt={alt} className={className} />
      </button>
      {zoomed ? (
        <ZoomView label={alt} onClose={() => setZoomed(false)}>
          <img src={url} alt={alt} className="max-h-[88vh] max-w-[90vw] rounded shadow-2xl" />
        </ZoomView>
      ) : null}
    </>
  );
}

/**
 * The whole jacket: the back cover, the spine and the front cover side by side,
 * so the author can see how the book will look in the round. The back uses the
 * book's description; the front uses the cover picture once there is one.
 */
export function BookJacket({
  title,
  author,
  genre,
  image,
  description,
}: {
  title: string;
  author: string;
  genre: Genre | undefined;
  image?: Blob;
  description: string;
}) {
  const url = useObjectUrl(image);
  const look = mockupLook(genre);
  const titleText = title.trim() || "Untitled";
  const authorText = author.trim() || "Your pen name";
  const style: CSSProperties = { background: look.background, color: look.ink, fontFamily: look.fontFamily };
  return (
    <div className="flex items-stretch" role="img" aria-label={`Book jacket for ${titleText} by ${authorText}: back, spine and front`}>
      <div className="flex h-72 w-48 flex-col justify-between overflow-hidden rounded-l-sm p-3 text-left shadow-md ring-1 ring-black/10" style={style}>
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: look.accent }}>
          {titleText}
        </p>
        <p className="max-h-36 overflow-hidden whitespace-pre-wrap text-[9px] leading-snug opacity-80">
          {description.trim() || "The back-cover description you write for Amazon KDP appears here."}
        </p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-[8px] opacity-70">{authorText}</p>
          <div className="h-9 w-14 bg-white/90 p-0.5" aria-hidden="true">
            <div
              className="h-full w-full"
              style={{ background: "repeating-linear-gradient(90deg, #111 0 1px, transparent 1px 3px)" }}
            />
          </div>
        </div>
      </div>
      <div className="flex h-72 w-6 items-center justify-center overflow-hidden shadow-md ring-1 ring-black/10" style={style}>
        <span
          className="max-h-64 truncate px-0.5 text-[10px] font-semibold tracking-wide"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          {titleText} · {authorText}
        </span>
      </div>
      {url ? (
        <img src={url} alt={`Front cover of ${titleText}`} className="h-72 w-48 rounded-r-sm object-cover shadow-md ring-1 ring-black/10" />
      ) : (
        <div className="relative flex h-72 w-48 flex-col items-center justify-between overflow-hidden rounded-r-sm p-4 text-center shadow-md ring-1 ring-black/10" style={style}>
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: look.accent }} aria-hidden="true" />
          <p className={cn("mt-6 text-xl font-semibold leading-tight", look.uppercase && "uppercase tracking-wide")}>{titleText}</p>
          <p className={cn("text-sm font-medium", look.uppercase && "uppercase tracking-widest")} style={{ color: look.accent }}>
            {authorText}
          </p>
        </div>
      )}
    </div>
  );
}

type MockupSize = "sm" | "lg" | "xl";

const SIZE: Record<MockupSize, { box: string; title: string; author: string }> = {
  sm: { box: "w-24 px-2 py-3", title: "text-[10px]", author: "text-[8px]" },
  lg: { box: "w-56 px-6 py-8", title: "text-2xl", author: "text-sm" },
  xl: { box: "w-[min(26rem,80vw)] px-10 py-14", title: "text-4xl", author: "text-lg" },
};

/**
 * A book-cover mockup. Without a picture it is drawn from the title and the pen
 * name in the style of the genre. With `image` (a cover made by the image AI) the
 * picture is shown instead. Clicking a mockup opens it full size, unless
 * `zoomable` is false. `size="sm"` is a thumbnail for a list.
 */
export function CoverMockup({
  title,
  author,
  genre,
  size = "lg",
  className,
  image,
  zoomable = true,
}: {
  title: string;
  author: string;
  genre: Genre | undefined;
  size?: MockupSize;
  className?: string;
  image?: Blob;
  zoomable?: boolean;
}) {
  const [zoomed, setZoomed] = useState(false);
  const url = useObjectUrl(image);
  const look = mockupLook(genre);
  const sizing = SIZE[size];
  const label = `Cover: ${title.trim() || "Untitled"} by ${author.trim() || "the author"}`;
  const style: CSSProperties = {
    background: look.background,
    color: look.ink,
    fontFamily: look.fontFamily,
  };

  const frame = cn(
    "relative flex aspect-[2/3] shrink-0 flex-col items-center justify-between overflow-hidden rounded-sm text-center shadow-md ring-1 ring-black/10",
    sizing.box,
    className,
  );

  const body = url ? (
    <img src={url} alt={label} className="absolute inset-0 size-full object-cover" />
  ) : (
    <>
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: look.accent }} aria-hidden="true" />
      <p className={cn("mt-4 font-semibold leading-tight", look.uppercase && "uppercase tracking-wide", sizing.title)}>
        {title.trim() || "Untitled"}
      </p>
      <p
        className={cn("font-medium", look.uppercase && "uppercase tracking-widest", sizing.author)}
        style={{ color: look.accent }}
      >
        {author.trim() || "Your pen name"}
      </p>
    </>
  );

  return (
    <>
      {zoomable ? (
        <button
          type="button"
          className={cn(frame, "cursor-zoom-in transition-transform hover:scale-[1.02]")}
          style={style}
          aria-label={label}
          title="Click to zoom"
          onClick={() => setZoomed(true)}
        >
          {body}
        </button>
      ) : (
        <div className={frame} style={style} role="img" aria-label={label}>
          {body}
        </div>
      )}
      {zoomed ? (
        <ZoomView label={label} onClose={() => setZoomed(false)}>
          <CoverMockup title={title} author={author} genre={genre} size="xl" image={image} zoomable={false} />
        </ZoomView>
      ) : null}
    </>
  );
}
