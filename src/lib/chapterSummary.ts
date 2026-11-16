import { db, type AiSettings, type Chapter, type ChapterSummary } from "@/db/schema";
import { askAi, chapterParts, CHAPTER_PART_CHARACTERS } from "./ai";
import { htmlToText } from "./text";

/**
 * Chapter summaries for the developmental editors (audit finding F28).
 *
 * Developmental editing is about structure, character and pacing across the whole
 * book, so the four developmental editors read a summary of every chapter instead
 * of the full text. Each summary is written by the AI from every word of its
 * chapter, saved on the chapter, and reused until the chapter's text changes.
 *
 * The line, copy and proofreading passes do NOT use these: they always read the
 * full chapter text (see requestStageReview in ai.ts).
 */

// TODO(human): Write, in plain English, what a chapter summary must capture for the
// developmental editors. They will judge plot, pacing, character arcs and loose threads
// from these summaries alone. Keep it to a short list; the AI will follow it exactly.
export const SUMMARY_BRIEF = `Summarise this chapter for a developmental editor in 150 to 250 words. Cover:
- what happens, in order
- which characters appear and what they want
- how the chapter ends`;

const SUMMARY_PERSONA =
  "You are an editorial assistant at a small publishing house. You write accurate, neutral chapter summaries for the developmental editors. You never judge or suggest changes; you only report what is on the page.";

/** A short fingerprint of a chapter's text (FNV-1a), so a stale summary can be spotted without storing the text twice. */
export function textFingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

/** True when the chapter has a summary made from its current text. */
export function hasFreshSummary(chapter: Chapter): boolean {
  return !!chapter.devSummary && chapter.devSummary.sourceHash === textFingerprint(htmlToText(chapter.content));
}

/**
 * Summarises one chapter from every word of it. A long chapter is read in parts,
 * one request each, and the part summaries are joined in order.
 */
export async function summarizeChapter(settings: AiSettings, chapter: Chapter): Promise<ChapterSummary> {
  const text = htmlToText(chapter.content);
  const parts = chapterParts(text, CHAPTER_PART_CHARACTERS);
  const pieces: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const label =
      parts.length > 1
        ? `CHAPTER "${chapter.title}" (part ${i + 1} of ${parts.length}; summarise only this part):`
        : `CHAPTER "${chapter.title}":`;
    const reply = await askAi(settings, SUMMARY_PERSONA, [
      { role: "user", content: `${SUMMARY_BRIEF}\n\nReply with the summary only.\n\n${label}\n${parts[i]}` },
    ]);
    const summary = reply.trim();
    if (!summary) throw new Error(`The AI returned an empty summary for "${chapter.title || "Untitled"}". Try again.`);
    pieces.push(parts.length > 1 ? `Part ${i + 1}: ${summary}` : summary);
  }
  return { text: pieces.join("\n"), sourceHash: textFingerprint(text), createdAt: Date.now() };
}

/**
 * Makes sure every chapter with text has a summary of its current text, writing only
 * the missing or stale ones. Returns the chapters with their summaries filled in.
 * `onProgress` is told before each summary is written, e.g. "Summarising chapter 3 of 12".
 */
export async function ensureSummaries(
  settings: AiSettings,
  chapters: Chapter[],
  onProgress?: (done: number, total: number, chapter: Chapter) => void,
): Promise<Chapter[]> {
  const stale = chapters.filter((c) => htmlToText(c.content).trim() && !hasFreshSummary(c));
  const fresh = new Map<string, ChapterSummary>();
  for (let i = 0; i < stale.length; i++) {
    onProgress?.(i, stale.length, stale[i]);
    const summary = await summarizeChapter(settings, stale[i]);
    // Saved one by one, so a failure part-way keeps the summaries already paid for.
    await db.chapters.update(stale[i].id, { devSummary: summary });
    fresh.set(stale[i].id, summary);
  }
  return chapters.map((c) => (fresh.has(c.id) ? { ...c, devSummary: fresh.get(c.id) } : c));
}
