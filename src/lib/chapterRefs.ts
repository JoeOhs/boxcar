import type { Chapter } from "@/db/schema";
import { chapterLabel, numberChapters, sortChapters } from "./chapters";

/**
 * Chapter references in developmental flags. The editors read the chapters as a numbered
 * list (see bigPicture) and refer to one as "[12]": its place in that list, front matter
 * included, not its chapter number. When the editors finish, each reference is saved with
 * the chapter's name, "[12: Chapter 10: The Return]", so it still names the right chapter
 * after chapters are added, removed or reordered during revision.
 */

/** The chapters in the order the developmental editors numbered them. */
export function briefOrder(chapters: Chapter[]): Chapter[] {
  return sortChapters(chapters.filter((chapter) => chapter.kind !== "scrap"));
}

/** "[12]" or "[12: Chapter 10: The Return]": the number, and the saved name when there is one. */
const REFERENCE = /\[(\d+)(?::\s*([^\]]+))?\]/g;

/** The title inside a saved name: "Chapter 10: The Return" gives "The Return"; "DEDICATION" stays as it is. */
function titleOf(savedName: string): string {
  return savedName.replace(/^Chapter \d+(?::\s*|$)/, "").trim();
}

/**
 * The chapters a flag cites. A reference saved with a name is found by that chapter's
 * title, wherever the chapter is now; only a bare "[12]" (or a name no chapter has any
 * more) falls back to the twelfth place in today's list.
 */
export function citedChapters(text: string, ordered: Chapter[]): Chapter[] {
  const found: Chapter[] = [];
  for (const match of text.matchAll(REFERENCE)) {
    const title = match[2] ? titleOf(match[2]) : "";
    const named = title ? ordered.filter((c) => c.title.trim() === title) : [];
    const chapter = named.length === 1 ? named[0] : ordered[Number(match[1]) - 1];
    if (chapter && !found.includes(chapter)) found.push(chapter);
  }
  return found;
}

/**
 * "[12]" becomes "[12: Chapter 10: The Return]", so the author (and the AI) can tell which
 * chapter is meant. A reference that already carries its name is left exactly as saved.
 */
export function expandChapterRefs(text: string, ordered: Chapter[]): string {
  const numbers = numberChapters(ordered);
  return text.replace(REFERENCE, (whole, n: string, saved?: string) => {
    if (saved) return whole;
    const chapter = ordered[Number(n) - 1];
    return chapter ? `[${n}: ${chapterLabel(chapter, numbers.get(chapter.id), "numbered-with-title")}]` : whole;
  });
}
