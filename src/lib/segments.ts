import { newId, type Id } from "@/db/schema";
import { countWords, escapeHtml } from "./text";

/**
 * A chapter is a stack of segments (scenes, sections). They are kept inside the
 * chapter's own HTML as <section data-segment="id" data-title="..."> blocks, so
 * the chapter text stays the single stored copy: revisions, suggestions, the
 * preview and the epub all keep working on it unchanged.
 */
export interface Segment {
  id: Id;
  title: string;
  html: string;
}

export function newSegment(html = "", title = ""): Segment {
  return { id: newId(), title, html };
}

/** Splits a chapter's HTML into segments. Text written before segments existed becomes one segment. */
export function parseSegments(html: string): Segment[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const segments: Segment[] = [];
  let loose = "";

  const flushLoose = () => {
    if (loose.trim()) segments.push(newSegment(loose));
    loose = "";
  };

  for (const node of Array.from(doc.body.childNodes)) {
    if (node instanceof Element && node.tagName === "SECTION" && node.hasAttribute("data-segment")) {
      flushLoose();
      segments.push({
        id: node.getAttribute("data-segment") || newId(),
        title: node.getAttribute("data-title") ?? "",
        html: node.innerHTML,
      });
    } else if (node instanceof Element) {
      loose += node.outerHTML;
    } else if (node.nodeType === Node.TEXT_NODE) {
      loose += escapeHtml(node.textContent ?? "");
    }
  }
  flushLoose();

  return segments.length > 0 ? segments : [newSegment()];
}

/** Joins segments back into the chapter's HTML. */
export function serializeSegments(segments: Segment[]): string {
  return segments
    .map((s) => `<section data-segment="${escapeHtml(s.id)}" data-title="${escapeHtml(s.title)}">${s.html}</section>`)
    .join("");
}

// Segments are replaced, never changed in place, so a count stays valid for the life of the object.
const wordCache = new WeakMap<Segment, number>();

export function segmentWords(segment: Segment): number {
  let words = wordCache.get(segment);
  if (words === undefined) {
    words = countWords(segment.html);
    wordCache.set(segment, words);
  }
  return words;
}

/** Moves a segment next to another one. Returns the same array when nothing would change. */
export function moveSegmentNextTo(segments: Segment[], movingId: Id, targetId: Id, after: boolean): Segment[] {
  if (movingId === targetId) return segments;
  const moving = segments.find((s) => s.id === movingId);
  if (!moving) return segments;
  const rest = segments.filter((s) => s.id !== movingId);
  const at = rest.findIndex((s) => s.id === targetId);
  if (at === -1) return segments;
  rest.splice(after ? at + 1 : at, 0, moving);
  return rest.every((s, i) => s === segments[i]) ? segments : rest;
}
