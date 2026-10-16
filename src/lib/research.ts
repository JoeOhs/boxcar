import type { Id, ResearchNote } from "@/db/schema";
import { documentToText, readDocument, titleFromFileName } from "./documents";
import { createResearchNote } from "./store";

/** Most text the Ghostwriter is given from the research, in characters. */
const CONTEXT_BUDGET = 12000;
const PER_ITEM_LIMIT = 4000;

/**
 * The research the Ghostwriter may read: every item the author has left shared, in order,
 * cut to a fixed size so a long research file cannot crowd out the chapter itself.
 */
export function researchContext(notes: ResearchNote[]): string {
  const shared = notes.filter((n) => n.shareWithGhostwriter && n.content.trim());
  if (shared.length === 0) return "";
  let budget = CONTEXT_BUDGET;
  const parts: string[] = [];
  for (const note of shared) {
    if (budget <= 0) break;
    const body = note.content.trim().slice(0, Math.min(PER_ITEM_LIMIT, budget));
    budget -= body.length;
    const source = note.url ? ` (${note.url})` : "";
    parts.push(`[${note.kind}] ${note.title}${source}\n${body}`);
  }
  return `Research the author keeps for this book. Use it as background; do not quote it unless asked:\n\n${parts.join("\n\n")}`;
}

/** Reads a file the author chooses and keeps its text as a research item. */
export async function importResearchFile(manuscriptId: Id, file: File): Promise<ResearchNote> {
  const text = documentToText(await readDocument(file)).trim();
  if (!text) throw new Error("That file has no text to add to the research.");
  return createResearchNote(manuscriptId, "file", titleFromFileName(file.name), text);
}
