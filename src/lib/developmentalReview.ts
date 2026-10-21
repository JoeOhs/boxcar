import { db, newId, type AiSettings, type Id, type Manuscript, type OutlineItem, type Suggestion } from "@/db/schema";
import { askAi, parseJson } from "./ai";
import { chapterLabel, numberChapters, sortChapters } from "./chapters";
import { genreById, genreContext } from "./genres";
import { htmlToText } from "./text";

/**
 * The developmental pass. Four specialist editors read the whole book, each with
 * its own expertise, and return notes on the big picture. The notes are saved as
 * suggestions, so the author can read them in the Edit screen, address them and
 * dismiss them. Every editor runs on the model chosen for the developmental pass.
 */

export interface DevelopmentalAgent {
  id: string;
  /** The name the author sees on each note, e.g. "Character editor". */
  name: string;
  /** Who the AI is told it is. Pre-programmed expertise for this specialist. */
  persona: string;
  /** What the AI is asked to look for in the whole book. */
  task: string;
}

export const DEVELOPMENTAL_AGENTS: DevelopmentalAgent[] = [
  {
    id: "structure",
    name: "Story structure editor",
    persona:
      "You are the story structure editor at a small publishing house. You look at the shape of the whole book: the plot, the narrative arc from the opening to the resolution, the turning points and whether each part of the structure earns its place. For non-fiction you look at the shape of the argument instead. You do not comment on sentences.",
    task: "Review the structure of the book. Look for a weak or missing arc, turning points that come too early, too late or not at all, plot holes, and sections that do not move the story or argument forward.",
  },
  {
    id: "character",
    name: "Character editor",
    persona:
      "You are the character editor at a small publishing house. You check that each character behaves consistently with who they are, that their motives are clear and that their arcs develop. You also check continuity of what characters know, where they are and what they have been told. You do not comment on sentences.",
    task: "Review the characters across the book. Look for behaviour that contradicts earlier chapters, motives that are unclear or unmotivated, characters who disappear or change without cause, and missing or thin arcs.",
  },
  {
    id: "pacing",
    name: "Pacing editor",
    persona:
      "You are the pacing editor at a small publishing house. You judge how fast the book moves: where tension rises and sags, whether scenes run too long or too short, and whether the order of scenes makes the reader want to keep going. You do not comment on sentences.",
    task: "Review the pacing of the book. Look for stretches where little happens, scenes that repeat what the reader already knows, sudden jumps in tension, and chapters that end without a reason to turn the page.",
  },
  {
    id: "organization",
    name: "Organisation editor",
    persona:
      "You are the organisation editor at a small publishing house. You check how the whole book is put together: that the promises made early are kept, that subplots and threads are closed or deliberately left open, that chapters are in the best order, and that the book is complete. For non-fiction you check that the argument is ordered so that each chapter builds on the one before. You do not comment on sentences.",
    task: "Review how the book is organised. Look for promises made but not kept, loose threads, chapters in an order that confuses, repeated material, and gaps where the reader is left without something they need.",
  },
];

/** Lines of the outline, indented by level, so the editors can see how the book is planned. */
function outlineLines(items: OutlineItem[]): string[] {
  const lines: string[] = [];
  const walk = (parentId: Id | null, depth: number) => {
    items
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach((item) => {
        lines.push(`${"  ".repeat(depth)}- ${item.kind}: ${item.title || "Untitled"}${item.summary ? ` - ${item.summary}` : ""}`);
        walk(item.id, depth + 1);
      });
  };
  walk(null, 0);
  return lines;
}

/**
 * The whole book in brief: the title and genre, the outline, and every chapter with
 * its number in square brackets and the start of its text. Notes refer to a chapter
 * by that number.
 */
export async function bigPicture(manuscript: Manuscript): Promise<string> {
  const [items, chapters] = await Promise.all([
    db.outlineItems.where("manuscriptId").equals(manuscript.id).toArray(),
    db.chapters.where("manuscriptId").equals(manuscript.id).toArray(),
  ]);
  const sorted = sortChapters(chapters);
  const numbers = numberChapters(sorted);
  const parts = [`Title: ${manuscript.title}`];
  const genre = genreContext(genreById(manuscript.genre));
  if (genre) parts.push(genre);
  if (manuscript.description.trim()) parts.push(`Description: ${manuscript.description.trim()}`);
  const outline = outlineLines(items);
  if (outline.length > 0) parts.push(`Outline:\n${outline.join("\n")}`);
  parts.push(
    `Chapters:\n${sorted
      .map(
        (c, i) =>
          `- [${i + 1}] ${chapterLabel(c, numbers.get(c.id), "numbered-with-title")} (${c.wordCount} words): ${htmlToText(c.content)
            .slice(0, 240)
            .replace(/\s+/g, " ")}`,
      )
      .join("\n")}`,
  );
  return parts.join("\n\n");
}

export interface DevelopmentalResult {
  /** Notes saved in total. */
  notes: number;
  /** Notes per specialist, in the order they ran. */
  perAgent: { name: string; notes: number }[];
}

/**
 * Runs the four developmental editors over the whole book, one after another, and
 * saves their notes. If any editor fails, nothing is saved and the error is thrown.
 */
export async function runDevelopmentalReview(manuscript: Manuscript, settings: AiSettings): Promise<DevelopmentalResult> {
  const chapters = sortChapters(await db.chapters.where("manuscriptId").equals(manuscript.id).toArray());
  if (!chapters.some((c) => htmlToText(c.content).trim())) {
    throw new Error("Write at least one chapter before the developmental pass.");
  }
  const context = (await bigPicture(manuscript)).slice(0, 30000);
  const found: Suggestion[] = [];
  const perAgent: DevelopmentalResult["perAgent"] = [];
  const now = Date.now();

  for (const agent of DEVELOPMENTAL_AGENTS) {
    const prompt =
      `${agent.task}\n\n` +
      `Reply with ONLY a JSON array (no prose, no code fences) of at most 6 objects with the keys "chapter" and "comment". ` +
      `"chapter" is the number in square brackets of the chapter the note is about, or 0 when it concerns the whole book. ` +
      `"comment" is one specific note: what is weak or wrong, why it matters, and how the author could fix it. ` +
      `Reply with [] when nothing needs raising.\n\nTHE BOOK:\n${context}`;
    const reply = await askAi(settings, agent.persona, [{ role: "user", content: prompt }]);
    const parsed = parseJson(reply, "[");
    if (!Array.isArray(parsed)) throw new Error(`The ${agent.name.toLowerCase()} sent a reply in the wrong shape. Try again.`);

    let count = 0;
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const { chapter, comment } = entry as Record<string, unknown>;
      const text = typeof comment === "string" ? comment.trim() : "";
      if (!text) continue;
      const number = typeof chapter === "number" ? Math.floor(chapter) : 0;
      const target = chapters[number - 1] ?? chapters[0];
      found.push({
        id: newId(),
        chapterId: target.id,
        manuscriptId: manuscript.id,
        source: "ai",
        role: "editor",
        stage: "developmental",
        kind: "note",
        original: "",
        replacement: "",
        comment: number >= 1 && chapters[number - 1] ? text : `Whole book: ${text}`,
        agent: agent.name,
        status: "pending",
        createdAt: now + found.length,
      });
      count++;
    }
    perAgent.push({ name: agent.name, notes: count });
  }

  if (found.length > 0) await db.suggestions.bulkAdd(found);
  return { notes: found.length, perAgent };
}
