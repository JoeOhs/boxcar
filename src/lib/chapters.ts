import type { Chapter, ChapterKind, HeadingStyle, Id } from "@/db/schema";

const RANK: Record<ChapterKind, number> = { front: 0, chapter: 1, back: 2, scrap: 3 };

/** Book order: front matter, then chapters, then back matter, then the Scrap bin; by `order` within each. */
export function sortChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.order - b.order);
}

/** The chapters that make the book. The Scrap bin is kept out of the preview, the export and the epub. */
export function bookChapters(chapters: Chapter[]): Chapter[] {
  return chapters.filter((chapter) => chapter.kind !== "scrap");
}

/** Chapter numbers (1, 2, 3 ...) for the "chapter" kind only. */
export function numberChapters(sorted: Chapter[]): Map<Id, number> {
  const numbers = new Map<Id, number>();
  let n = 0;
  for (const chapter of sorted) {
    if (chapter.kind === "chapter") numbers.set(chapter.id, ++n);
  }
  return numbers;
}

export const CHAPTER_KIND_LABEL: Record<ChapterKind, string> = {
  front: "Front matter",
  chapter: "Chapters",
  back: "Back matter",
  scrap: "Scrap bin",
};

/** The text used for a chapter in the table of contents. */
export function chapterLabel(chapter: Chapter, number: number | undefined, style: HeadingStyle): string {
  const title = chapter.title.trim();
  if (chapter.kind !== "chapter" || number === undefined) return title || "Untitled";
  if (style === "plain") return title || `Chapter ${number}`;
  if (style === "numbered") return `Chapter ${number}`;
  return title ? `Chapter ${number}: ${title}` : `Chapter ${number}`;
}
