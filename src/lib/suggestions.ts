import { db, type Suggestion } from "@/db/schema";
import { saveChapter, snapshotChapter } from "./store";
import { replaceInHtml } from "./text";

/** What happened when a suggestion was accepted. */
export type ApplyOutcome = "applied" | "missing" | "ambiguous" | "note";

/**
 * Accepts a suggestion. A change is applied to the chapter: read, snapshot, save and mark
 * accepted in one transaction, so all of it happens or none of it. A note is only marked.
 * Used by the Reports tab, the flags pane and the Ghostwriter's walkthrough.
 */
export async function applySuggestion(s: Suggestion): Promise<ApplyOutcome> {
  if (s.kind === "note") {
    await db.suggestions.update(s.id, { status: "accepted" });
    return "note";
  }
  return db.transaction("rw", db.chapters, db.revisions, db.suggestions, async () => {
    const fresh = await db.chapters.get(s.chapterId);
    if (!fresh) return "missing" as const;
    const result = replaceInHtml(fresh.content, s.original, s.replacement);
    if (!result.ok) return result.reason;
    await snapshotChapter(fresh, "Before accepting a suggestion");
    await saveChapter(fresh.id, { content: result.html });
    await db.suggestions.update(s.id, { status: "accepted" });
    return "applied" as const;
  });
}

/** The author-facing message for an accepted change that could not be applied, or null when it went in. */
export function applyProblem(outcome: ApplyOutcome): string | null {
  if (outcome === "missing") return "That passage is no longer in the chapter, so the change could not be applied.";
  if (outcome === "ambiguous") return "That passage appears more than once in the chapter, so it was not changed. Make the edit by hand, or reject it.";
  return null;
}
