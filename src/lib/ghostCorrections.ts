import { db, newId, type AiSettings, type Chapter, type Manuscript, type Suggestion } from "@/db/schema";
import { askAi, parseJson, systemPrompt } from "./ai";
import { briefOrder, citedChapters, expandChapterRefs } from "./chapterRefs";
import { chapterLabel, numberChapters } from "./chapters";
import { bigPicture } from "./developmentalReview";
import { htmlToText } from "./text";

export { briefOrder, citedChapters, expandChapterRefs };

/**
 * The Ghostwriter's answer to a whole-book developmental flag: a short plan, and corrections
 * across the chapters the flag is about. A correction whose quote is found in its chapter
 * becomes a change the author accepts or rejects; one that cannot be placed exactly becomes a
 * "make this change by hand" item, so the Ghostwriter's work is never thrown away.
 */

/** Most text sent when a flag cites no chapter: the start of the book, in order, up to this many characters. */
const UNCITED_BOOK_CHARACTERS = 60000;

/** Why a correction could not be placed in the text exactly. */
export type PlaceProblem = "missing" | "repeated" | "paragraphs";

export interface CorrectionsResult {
  /** Corrections placed exactly, ready to accept or reject. */
  saved: number;
  /** Corrections kept for the author to make by hand, with why each could not be placed. */
  byHand: PlaceProblem[];
  /** Entries left out because they changed nothing or named no passage. */
  skipped: number;
  /** The chapters that received corrections, in book order. */
  chapters: Chapter[];
}

const SINGLE_QUOTES = "‘’‚‛′";
const DOUBLE_QUOTES = "“”„‟″";
const DASHES = "‐‑‒–—―−";

/**
 * Folds the differences a model often makes when copying text: curly and straight quotes,
 * dash styles, the ellipsis character and three dots, and any run of spaces. Returns the
 * folded text and, for each folded character, where it came from in the original.
 */
function fold(text: string): { folded: string; from: number[] } {
  let folded = "";
  const from: number[] = [];
  const push = (s: string, at: number) => {
    for (const ch of s) {
      folded += ch;
      from.push(at);
    }
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (!folded.endsWith(" ")) push(" ", i);
    } else if (SINGLE_QUOTES.includes(ch)) push("'", i);
    else if (DOUBLE_QUOTES.includes(ch)) push("\"", i);
    else if (DASHES.includes(ch)) push("-", i);
    else if (ch === "…") push("...", i);
    else push(ch, i);
  }
  return { folded, from };
}

/**
 * Finds a quoted passage in a chapter the way the change will later be applied: inside one
 * paragraph, exactly once, allowing for the copying differences fold() evens out. Returns
 * the chapter's own wording of the passage, so applying it matches character for character.
 */
export function locateQuote(chapterText: string, quote: string): { original: string } | { problem: PlaceProblem } {
  const needle = fold(quote.trim()).folded.trim();
  if (!needle) return { problem: "missing" };
  const hits: string[] = [];
  for (const paragraph of chapterText.split("\n")) {
    const { folded, from } = fold(paragraph);
    for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + 1)) {
      hits.push(paragraph.slice(from[at], from[at + needle.length - 1] + 1));
    }
  }
  if (hits.length === 1) return { original: hits[0] };
  if (hits.length > 1) return { problem: "repeated" };
  // Not inside any one paragraph: if it is there across paragraphs, say so.
  return fold(chapterText).folded.includes(needle) ? { problem: "paragraphs" } : { problem: "missing" };
}

/**
 * Asks the Ghostwriter to fix a whole-book flag with exact corrections. It reads the book in
 * brief plus the full text of every chapter the flag cites (or, when it cites none, as much of
 * the book as fits). A correction is applied only where its quote is found exactly once; if
 * the chapter it named does not have it but exactly one other chapter given to it does, it is
 * placed there (the model mixed up the two kinds of chapter number).
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
  const key = (c: Chapter) => ordered.indexOf(c) + 1;
  const flagText = expandChapterRefs(flag.comment.replace(/^Whole book:\s*/, ""), ordered);

  const cited = citedChapters(flag.comment, ordered);
  let given: Chapter[] = cited;
  if (cited.length === 0) {
    given = [];
    let size = 0;
    for (const c of ordered) {
      size += htmlToText(c.content).length;
      if (size > UNCITED_BOOK_CHARACTERS && given.length > 0) break;
      given.push(c);
    }
  }
  const fullText = given.map((c) => `=== KEY ${key(c)} · ${label(c)} ===\n${htmlToText(c.content)}`).join("\n\n");

  const prompt =
    `The ${(flag.agent ?? "developmental editor").toLowerCase()} raised this flag about the whole book, not one chapter:\n"${flagText}"\n\n` +
    `Fix it with the fewest, smallest corrections to the existing text, in my voice. Do not write new scenes or sections.\n\n` +
    `Reply with ONLY a JSON object (no prose, no code fences) with the keys "plan" and "corrections". ` +
    `"plan" is a short note of what you decided, e.g. the one timeline every chapter now follows. ` +
    `"corrections" is an array of objects with the keys "chapter", "original", "replacement" and "comment":\n` +
    `- "chapter" is the KEY number of the chapter to change, from its "=== KEY n · ... ===" heading below ` +
    `(for "=== KEY 19 · Chapter 17: The Return ===" it is 19, not 17).\n` +
    `- "original" is copied from that chapter's text character for character, including its punctuation and quotation marks, ` +
    `from within a single paragraph, and long enough (a full sentence or more) to appear only once.\n` +
    `- "replacement" is the corrected passage; "comment" says briefly why.\n` +
    `Only correct chapters whose full text is given below.\n\n` +
    `THE BOOK IN BRIEF:\n${await bigPicture(manuscript, all)}\n\nFULL TEXT OF THE CHAPTERS CONCERNED:\n${fullText}`;

  const reply = await askAi(settings, systemPrompt("ghostwriter", ""), [{ role: "user", content: prompt }]);
  const parsed = parseJson(reply, "{") as { plan?: unknown; corrections?: unknown };
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.corrections)) {
    throw new Error("The Ghostwriter sent its corrections in the wrong shape. Try again.");
  }

  const now = Date.now();
  const found: Suggestion[] = [];
  const byHand: PlaceProblem[] = [];
  let skipped = 0;
  for (const entry of parsed.corrections) {
    if (typeof entry !== "object" || entry === null) continue;
    const { chapter, original, replacement, comment } = entry as Record<string, unknown>;
    const named = typeof chapter === "number" ? ordered[Math.floor(chapter) - 1] : undefined;
    const from = typeof original === "string" ? original.trim() : "";
    const to = typeof replacement === "string" ? replacement.trim() : "";
    if (!from || fold(from).folded === fold(to).folded) {
      skipped++;
      continue;
    }

    // The chapter it named first, then every other chapter it was given.
    let placed: { chapter: Chapter; original: string } | null = null;
    let problem: PlaceProblem = "missing";
    if (named) {
      const hit = locateQuote(htmlToText(named.content), from);
      if ("original" in hit) placed = { chapter: named, original: hit.original };
      else problem = hit.problem;
    }
    if (!placed && problem === "missing") {
      const elsewhere = given
        .filter((c) => c !== named)
        .map((c) => ({ chapter: c, hit: locateQuote(htmlToText(c.content), from) }))
        .filter((x) => "original" in x.hit || x.hit.problem !== "missing");
      if (elsewhere.length === 1 && "original" in elsewhere[0].hit) {
        placed = { chapter: elsewhere[0].chapter, original: elsewhere[0].hit.original };
      } else if (elsewhere.length > 1) {
        problem = "repeated";
      } else if (elsewhere.length === 1 && "problem" in elsewhere[0].hit) {
        problem = elsewhere[0].hit.problem;
      }
    }

    if (!placed) byHand.push(problem);
    found.push({
      id: newId(),
      chapterId: placed?.chapter.id ?? named?.id ?? given[0]?.id ?? flag.chapterId,
      manuscriptId: manuscript.id,
      source: "ai",
      role: "ghostwriter",
      agent: "Ghostwriter",
      stage: "developmental",
      // A correction that could not be placed is kept as a note: the author makes it by hand.
      kind: placed ? "change" : "note",
      original: placed?.original ?? from,
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
  return { saved: found.length - byHand.length, byHand, skipped, chapters: ordered.filter((c) => touched.has(c.id)) };
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
