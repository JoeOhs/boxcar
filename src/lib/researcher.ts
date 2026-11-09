import { db, type AiSettings, type Manuscript, type ResearchNote } from "@/db/schema";
import { askAi, ROLE_PROMPT } from "./ai";
import { genreById, genreContext } from "./genres";
import { createResearchNote } from "./store";
import { htmlToText } from "./text";

/**
 * The Researcher agent: the author names a topic, the agent researches it for
 * this book and the finished notes are saved in the Research menu, ready to be
 * shared with the Ghostwriter and the Outliner as context.
 */
export async function runResearcher(settings: AiSettings, manuscript: Manuscript, topic: string): Promise<ResearchNote> {
  const subject = topic.trim();
  if (!subject) throw new Error("Name a topic for the Researcher first.");

  const chapters = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
  const opening = chapters
    .slice(0, 3)
    .map((chapter) => htmlToText(chapter.content).slice(0, 400))
    .filter(Boolean)
    .join("\n\n");

  const brief = [
    `Research this topic for the book "${manuscript.title}": ${subject}`,
    genreContext(genreById(manuscript.genre)),
    manuscript.description.trim() ? `The book is about: ${manuscript.description.trim()}` : "",
    opening ? `The opening of the book, for tone and subject:\n${opening}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt =
    `${brief}\n\n` +
    `Write thorough, well-organised research notes for the author, under clear headings. ` +
    `Include the facts, names, dates, places, vocabulary and concrete details a novelist would need, and say where a claim is uncertain. ` +
    `Do not write the book itself and do not invent sources. Keep the notes ready to read and reuse.`;

  const reply = await askAi(settings, ROLE_PROMPT.researcher, [{ role: "user", content: prompt }]);
  return createResearchNote(manuscript.id, "note", `Research: ${subject.slice(0, 80)}`, reply);
}
