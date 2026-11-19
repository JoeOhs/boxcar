import { db, newId, type AiSettings, type Chapter, type Manuscript, type Suggestion } from "@/db/schema";
import { askAi, parseJson, systemPrompt } from "./ai";
import { briefOrder, citedChapters, expandChapterRefs } from "./chapterRefs";
import { chapterLabel, numberChapters } from "./chapters";
import { bigPicture } from "./developmentalReview";
import { htmlToText } from "./text";

export { briefOrder, citedChapters, expandChapterRefs };

/**
 * The Ghostwriter's answer to a whole-book developmental flag: a short plan, and exact
 * corrections across the chapters the flag is about. Each correction becomes a change the
 * author accepts or rejects in the flags pane, under its own chapter.
 */

/** Most text sent when a flag cites no chapter: the start of the book, in order, up to this many characters. */
const UNCITED_BOOK_CHARACTERS = 60000;

export interface CorrectionsResult {
  /** Corrections saved for the author to accept or reject. */
  saved: number;
  /** Corrections dropped because the passage they quote is not in that chapter word for word. */
  dropped: number;
  /** The chapters that received corrections, in book order. */
  chapters: Chapter[];
}

/**
 * Asks the Ghostwriter to fix a whole-book flag with exact corrections. It reads the
 * book in brief plus the full text of every chapter the flag cites (or, when it cites
 * none, as much of the book as fits). A correction is kept only if the passage it
 * quotes is really in that chapter, so a misremembered quote can never change the text.
 */
export async function requestWholeBookCorrections(
  settings: AiSettings,
  manuscript: Manuscript,
  flag: Suggestion,
): Promise<CorrectionsResult> {
  const all = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
  const ordered = briefOrder(all);
  const numbers = numberChapters(ordered);
  const label = (c: Chapter) => chapterLabel(c, numbers.get(c.id), "numbered-with-title");
  const flagText = expandChapterRefs(flag.comment.replace(/^Whole book:\s*/, ""), ordered);

  const cited = citedChapters(flag.comment, ordered);
  let fullText = "";
  if (cited.length > 0) {
    fullText = cited.map((c) => `[${ordered.indexOf(c) + 1}] ${label(c)}:\n${htmlToText(c.content)}`).join("\n\n");
  } else {
    for (const c of ordered) {
      const block = `[${ordered.indexOf(c) + 1}] ${label(c)}:\n${htmlToText(c.content)}`;
      if (fullText.length + block.length > UNCITED_BOOK_CHARACTERS) break;
      fullText += (fullText ? "\n\n" : "") + block;
    }
  }

  const prompt =
    `The ${(flag.agent ?? "developmental editor").toLowerCase()} raised this flag about the whole book, not one chapter:\n"${flagText}"\n\n` +
    `Fix it with the fewest, smallest corrections to the existing text, in my voice. Do not write new scenes or sections.\n\n` +
    `Reply with ONLY a JSON object (no prose, no code fences) with the keys "plan" and "corrections". ` +
    `"plan" is a short note of what you decided, e.g. the one timeline every chapter now follows. ` +
    `"corrections" is an array of objects with the keys "chapter", "original", "replacement" and "comment": ` +
    `"chapter" is the number in square brackets of the chapter to change; "original" is a passage copied exactly, word for word, ` +
    `from that chapter's text below, long enough to appear only once; "replacement" is the corrected passage; ` +
    `"comment" says briefly why. Only correct chapters whose full text is given below.\n\n` +
    `THE BOOK IN BRIEF:\n${await bigPicture(manuscript, all)}\n\nFULL TEXT OF THE CHAPTERS CONCERNED:\n${fullText}`;

  const reply = await askAi(settings, systemPrompt("ghostwriter", ""), [{ role: "user", content: prompt }]);
  const parsed = parseJson(reply, "{") as { plan?: unknown; corrections?: unknown };
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.corrections)) {
    throw new Error("The Ghostwriter sent its corrections in the wrong shape. Try again.");
  }

  const now = Date.now();
  const found: Suggestion[] = [];
  let dropped = 0;
  for (const entry of parsed.corrections) {
    if (typeof entry !== "object" || entry === null) continue;
    const { chapter, original, replacement, comment } = entry as Record<string, unknown>;
    const target = typeof chapter === "number" ? ordered[Math.floor(chapter) - 1] : undefined;
    const from = typeof original === "string" ? original.trim() : "";
    const to = typeof replacement === "string" ? replacement.trim() : "";
    if (!target || !from || from === to) {
      dropped++;
      continue;
    }
    // The quote must be in the chapter exactly once, or accepting it could change the wrong place.
    const text = htmlToText(target.content);
    const first = text.indexOf(from);
    if (first === -1 || text.indexOf(from, first + 1) !== -1) {
      dropped++;
      continue;
    }
    found.push({
      id: newId(),
      chapterId: target.id,
      manuscriptId: manuscript.id,
      source: "ai",
      role: "ghostwriter",
      agent: "Ghostwriter",
      stage: "developmental",
      kind: "change",
      original: from,
      replacement: to,
      comment: typeof comment === "string" ? comment.trim() : "",
      forFlag: flag.id,
      status: "pending",
      createdAt: now + found.length,
    });
  }

  const plan = typeof parsed.plan === "string" ? parsed.plan.trim() : "";
  await db.transaction("rw", db.suggestions, async () => {
    // A second request replaces the first one's corrections that were never accepted or rejected.
    const stale = await db.suggestions.where("manuscriptId").equals(manuscript.id).filter((s) => s.forFlag === flag.id && s.status === "pending").primaryKeys();
    await db.suggestions.bulkDelete(stale);
    if (found.length > 0) await db.suggestions.bulkAdd(found);
    await db.suggestions.update(flag.id, { ghostPlan: plan || undefined });
  });

  const touched = new Set(found.map((s) => s.chapterId));
  return { saved: found.length, dropped, chapters: ordered.filter((c) => touched.has(c.id)) };
}

/**
 * Once every correction the Ghostwriter made for a flag is accepted or rejected, the flag
 * itself is marked Accepted, the same as pushing a Ghostwriter passage in.
 */
export async function settleFlagIfDone(correction: Suggestion): Promise<void> {
  if (!correction.forFlag) return;
  const flagId = correction.forFlag;
  const open = await db.suggestions.where("manuscriptId").equals(correction.manuscriptId).filter((s) => s.forFlag === flagId && s.status === "pending").count();
  if (open === 0) await db.suggestions.update(flagId, { status: "accepted" });
}
