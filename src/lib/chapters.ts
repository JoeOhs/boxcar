import type { Chapter, ChapterKind, ChapterStatus, HeadingStyle, Id } from "@/db/schema";

const RANK: Record<ChapterKind, number> = { front: 0, chapter: 1, back: 2 };

/**
 * The stages a chapter can be in, fixed: the Roadmap's stages (Outline, Write, Edit, Format,
 * Publish) with Edit split into its four passes. Shown in the Write screen's status menu.
 */
export const CHAPTER_STATUS_CHOICES: { value: ChapterStatus; label: string }[] = [
  { value: "outlining", label: "Outline" },
  { value: "drafting", label: "Write" },
  { value: "developmental", label: "Edit: developmental" },
  { value: "line", label: "Edit: line" },
  { value: "copy", label: "Edit: copy" },
  { value: "proofread", label: "Edit: proofread" },
  { value: "formatting", label: "Format" },
  { value: "ready", label: "Publish" },
];

/** Book order: front matter, then chapters, then back matter; by `order` within each. */
export function sortChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.order - b.order);
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
};

/** The text used for a chapter in the table of contents. */
export function chapterLabel(chapter: Chapter, number: number | undefined, style: HeadingStyle): string {
  const title = chapter.title.trim();
  if (chapter.kind !== "chapter" || number === undefined) return title || "Untitled";
  if (style === "plain") return title || `Chapter ${number}`;
  if (style === "numbered") return `Chapter ${number}`;
  return title ? `Chapter ${number}: ${title}` : `Chapter ${number}`;
}
