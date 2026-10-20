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
