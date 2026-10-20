import { db, newId, type AiSettings, type Chapter, type Id, type Manuscript, type Suggestion } from "@/db/schema";
import { askAi, parseJson, requestStageReview } from "./ai";
import { sortChapters } from "./chapters";
import { seedRoadmap } from "./roadmap";
import { countWords, htmlToText } from "./text";
import { bookTypeOf } from "./bookTypes";

/**
 * Translation of a whole book into another language, one chapter at a time.
 *
 * A translation is a new manuscript in the same workspace, linked to the original
 * (`translationOf`), with one chapter for each chapter of the original (linked by
 * `sourceChapterId`). Nothing is translated when it is created. The author asks for
 * each chapter in turn, reads it, may ask the AI proofreader to check it (its
 * suggestions wait in Edit to be accepted or rejected), and then approves it.
 *
 * The chapter is translated in small batches of paragraphs, each batch one request
 * to the author's own AI key. The HTML tags are kept and only the text is translated.
 */

export interface TargetLanguage {
  /** BCP 47 code written into the epub, e.g. "es" or "pt-BR". */
  code: string;
  /** The language's name, as the AI is told it, e.g. "Spanish". */
  name: string;
}

/** Characters of text sent to the AI in one request. */
const BATCH_CHARACTERS = 5000;

/** The block elements whose text is translated. Nested blocks are left to their children. */
const BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,blockquote,div";

/** Makes a new translation of a book: its chapters are laid out, but none is translated yet. */
export async function createTranslation(source: Manuscript, target: TargetLanguage): Promise<Manuscript> {
  const now = Date.now();
  const translation: Manuscript = {
    id: newId(),
    workspaceId: source.workspaceId,
    title: `${source.title} (${target.name})`,
    subtitle: "",
    description: "",
    language: target.code,
    isbn: "",
    keywords: [],
    copyright: source.copyright,
    status: "drafting",
    type: bookTypeOf(source),
    genre: source.genre,
    targetWordCount: source.targetWordCount,
    format: { ...source.format },
    translationOf: source.id,
    languageName: target.name,
    createdAt: now,
    updatedAt: now,
  };
  const sourceChapters = sortChapters(await db.chapters.where("manuscriptId").equals(source.id).toArray());
  await db.transaction("rw", db.manuscripts, db.chapters, async () => {
    await db.manuscripts.add(translation);
    await db.chapters.bulkAdd(
      sourceChapters.map((c) => ({
        id: newId(),
        manuscriptId: translation.id,
        kind: c.kind,
        title: "",
        content: "",
        wordCount: 0,
        status: "draft" as const,
        order: c.order,
        sourceChapterId: c.id,
        translationState: "pending" as const,
        createdAt: now,
        updatedAt: now,
      })),
    );
  });
  await seedRoadmap(translation.id);
  return translation;
}

/** The text blocks of a chapter's HTML, in order, from a parsed copy of it. */
function textBlocks(doc: Document): Element[] {
  return Array.from(doc.body.querySelectorAll(BLOCKS)).filter(
    (el) => !el.querySelector(BLOCKS) && (el.textContent ?? "").trim() !== "",
  );
}

/** Splits the strings into batches that each stay under the size limit. */
function batchesOf(items: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length > 0 && size + item.length > BATCH_CHARACTERS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Sends one batch of paragraphs (as HTML strings) and returns them translated, in the same order. */
async function translateBatch(settings: AiSettings, batch: string[], target: TargetLanguage): Promise<string[]> {
  const system =
    `You are a professional literary translator working on a book. You translate into ${target.name} (${target.code}) ` +
    "faithfully and fluently, keeping the author's tone, register and style. You never add commentary.";
  const prompt =
    `Translate every string in the JSON array below into ${target.name}.\n` +
    "Rules: keep every HTML tag exactly as it is and translate only the text between the tags. " +
    "Keep the same number of strings, in the same order. Keep the names of people and places consistent. " +
    `Reply with ONLY a JSON array of ${batch.length} strings, with no prose and no code fences.\n\n` +
    JSON.stringify(batch);
  const reply = await askAi(settings, system, [{ role: "user", content: prompt }]);
  const parsed = parseJson(reply, "[");
  if (!Array.isArray(parsed) || parsed.length !== batch.length || !parsed.every((s) => typeof s === "string")) {
    throw new Error("The translation came back in the wrong shape. Try translating this chapter again.");
  }
  return parsed as string[];
}

/** Removes anything that could run or restyle the page from text the AI sent back. */
function sanitize(doc: Document): void {
  doc.body.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("style");
    for (const name of el.getAttributeNames()) {
      if (name.startsWith("on")) el.removeAttribute(name);
    }
  });
}

/**
 * Translates one chapter of a translation into the target language and stores it
 * on the translation's chapter. The chapter's title and every paragraph are
 * translated; the layout (scenes, headings, lists) is kept as it is.
 */
export async function translateChapter(
  settings: AiSettings,
  source: Chapter,
  translation: Chapter,
  target: TargetLanguage,
): Promise<void> {
  const parsed = new DOMParser().parseFromString(source.content, "text/html");
  const blocks = textBlocks(parsed);
  const sourceTitle = source.title.trim();
  const items: string[] = [];
  if (sourceTitle) items.push(sourceTitle);
  for (const block of blocks) items.push(block.innerHTML);
  if (items.length === 0) throw new Error("This chapter has no text to translate yet.");

  const translated: string[] = [];
  for (const batch of batchesOf(items)) {
    // Batches run one after another, so the chapter is never sent as one long request.
    translated.push(...(await translateBatch(settings, batch, target)));
  }

  let cursor = 0;
  let title = "";
  if (sourceTitle) {
    const titleDoc = new DOMParser().parseFromString(translated[cursor], "text/html");
    title = (titleDoc.body.textContent ?? "").trim();
    cursor++;
  }
  blocks.forEach((block, i) => {
    block.innerHTML = translated[cursor + i];
  });
  sanitize(parsed);
  const content = parsed.body.innerHTML;
  await db.chapters.update(translation.id, {
    title,
    content,
    wordCount: countWords(content),
    translationState: "translated",
    updatedAt: Date.now(),
  });
}

/**
 * Asks the AI proofreader to check a translated chapter. Its suggestions are saved
 * against that chapter (for the author to accept or reject in Edit). Returns how many were made.
 */
export async function proofreadTranslation(settings: AiSettings, chapter: Chapter): Promise<number> {
  const text = htmlToText(chapter.content);
  if (!text) throw new Error("Translate this chapter first, then proofread it.");
  const edits = await requestStageReview(settings, "proofread", text, "", "");
  const now = Date.now();
  await db.transaction("rw", db.suggestions, db.chapters, async () => {
    const rows: Suggestion[] = edits.map((edit) => ({
      id: newId(),
      chapterId: chapter.id,
      manuscriptId: chapter.manuscriptId,
      source: "ai",
      role: "proofreader",
      stage: "proofread",
      kind: edit.kind,
      original: edit.original,
      replacement: edit.replacement,
      comment: edit.comment,
      status: "pending",
      createdAt: now,
    }));
    if (rows.length > 0) await db.suggestions.bulkAdd(rows);
    await db.chapters.update(chapter.id, { translationState: "proofread", updatedAt: now });
  });
  return edits.length;
}

/** Marks a translated chapter as approved by the author (or takes the approval back). */
export async function setChapterApproved(chapterId: Id, approved: boolean): Promise<void> {
  await db.chapters.update(chapterId, {
    translationState: approved ? "approved" : "translated",
    status: approved ? "final" : "revised",
    updatedAt: Date.now(),
  });
}
