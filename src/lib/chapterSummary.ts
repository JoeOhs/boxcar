import { db, type AiSettings, type Chapter, type ChapterSummary, type Manuscript } from "@/db/schema";
import { askAi, chapterParts, CHAPTER_PART_CHARACTERS } from "./ai";
import { genreById, type GenreCategory } from "./genres";
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

// What a chapter summary must capture, written by the author. The developmental editors
// judge the book from these summaries alone, so each brief is the editors' only view of it.

export const SUMMARY_BRIEF_FICTION = `Summarise this chapter for a developmental editor in 200 to 300 words. The editor will judge plot, pacing, character arcs and loose threads from your summary alone and will never see the chapter text, so report facts, not opinions. Cover:
- what happens, in order, and why each event happens (cause and effect)
- point of view, tense, setting and time of the chapter, in a few words
- each character who appears: what they want in this chapter, what stands in their way, and any change in their goals, beliefs or relationships
- the stakes and the tension: what is at risk, and whether it rises, falls or stays flat
- every thread this chapter opens, advances or resolves: mysteries, promises, conflicts, subplots, foreshadowing and reveals, including any left hanging at the end of the chapter
- new facts or rules the chapter establishes that later chapters must stay consistent with
- how the chapter ends and what it leaves the reader wanting to know
Rules: use only what is in the chapter; never invent, guess or fill gaps. Do not judge quality or suggest changes. Do not quote the text. Write plain prose or short lines, with no headings.`;

export const SUMMARY_BRIEF_NONFICTION = `Summarise this chapter for a developmental editor in 200 to 300 words. The editor will judge the book's argument, structure, organisation and reader value from your summary alone and will never see the chapter text, so report facts, not opinions. Cover:
- the chapter's main claim or purpose, in one sentence
- the steps of the argument or explanation, in order, and how each step leads to the next
- the support used: kinds of evidence, data, sources, examples, anecdotes or case studies, and which claims they back (and any claim given no support)
- key terms, frameworks or concepts introduced, and any the chapter assumes the reader already knows
- what the chapter assumes about the reader (prior knowledge, experience, goals) and the tone it takes towards them
- connections to the rest of the book: what it builds on, what it sets up, and anything it refers back to or says will come later
- if the chapter tells a story (memoir, narrative or case study), also give the key events in order and the people involved
- what the reader should know, feel or be able to do by the end, and how the chapter closes
Rules: use only what is in the chapter; never invent, guess or fill gaps. Do not judge quality or suggest changes. Do not quote the text. Write plain prose or short lines, with no headings.`;

/** The brief for a book's category, taken from its genre (fiction or non-fiction). */
export function summaryBriefFor(kind: GenreCategory): string {
  return kind === "nonfiction" ? SUMMARY_BRIEF_NONFICTION : SUMMARY_BRIEF_FICTION;
}

/** Fiction or non-fiction, from the manuscript's genre. A book with no genre yet is treated as fiction. */
export function categoryOf(manuscript: Pick<Manuscript, "genre">): GenreCategory {
  return genreById(manuscript.genre)?.category ?? "fiction";
}

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

/**
 * Fingerprint of what a summary depends on: the brief and the chapter text. Changing
 * either (a rewritten chapter, or a new brief) makes the old summary stale.
 */
function summarySource(chapter: Chapter, kind: GenreCategory): string {
  return textFingerprint(`${summaryBriefFor(kind)}\n\n${htmlToText(chapter.content)}`);
}

/** True when the chapter has a summary made from its current text with the current brief. */
export function hasFreshSummary(chapter: Chapter, kind: GenreCategory): boolean {
  return !!chapter.devSummary && chapter.devSummary.sourceHash === summarySource(chapter, kind);
}

/**
 * Summarises one chapter from every word of it, following the brief for the book's
 * category. A long chapter is read in parts, one request each, and the part summaries
 * are joined in order.
 */
export async function summarizeChapter(settings: AiSettings, chapter: Chapter, kind: GenreCategory): Promise<ChapterSummary> {
  const brief = summaryBriefFor(kind);
  const text = htmlToText(chapter.content);
  const parts = chapterParts(text, CHAPTER_PART_CHARACTERS);
  const pieces: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const label =
      parts.length > 1
        ? `CHAPTER "${chapter.title}" (part ${i + 1} of ${parts.length}; summarise only this part):`
        : `CHAPTER "${chapter.title}":`;
    const reply = await askAi(settings, SUMMARY_PERSONA, [
      { role: "user", content: `${brief}\n\nReply with the summary only.\n\n${label}\n${parts[i]}` },
    ]);
    const summary = reply.trim();
    if (!summary) throw new Error(`The AI returned an empty summary for "${chapter.title || "Untitled"}". Try again.`);
    pieces.push(parts.length > 1 ? `Part ${i + 1}: ${summary}` : summary);
  }
  return { text: pieces.join("\n"), sourceHash: summarySource(chapter, kind), createdAt: Date.now() };
}

/**
 * Makes sure every chapter with text has a summary of its current text, writing only
 * the missing or stale ones. Returns the chapters with their summaries filled in.
 * `onProgress` is told before each summary is written, e.g. "Summarising chapter 3 of 12".
 */
export async function ensureSummaries(
  settings: AiSettings,
  chapters: Chapter[],
  kind: GenreCategory,
  onProgress?: (done: number, total: number, chapter: Chapter) => void,
): Promise<Chapter[]> {
  const stale = chapters.filter((c) => htmlToText(c.content).trim() && !hasFreshSummary(c, kind));
  const fresh = new Map<string, ChapterSummary>();
  for (let i = 0; i < stale.length; i++) {
    onProgress?.(i, stale.length, stale[i]);
    const summary = await summarizeChapter(settings, stale[i], kind);
    // Saved one by one, so a failure part-way keeps the summaries already paid for.
    await db.chapters.update(stale[i].id, { devSummary: summary });
    fresh.set(stale[i].id, summary);
  }
  return chapters.map((c) => (fresh.has(c.id) ? { ...c, devSummary: fresh.get(c.id) } : c));
}
