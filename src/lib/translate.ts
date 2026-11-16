import { db, newId, type AiSettings, type Chapter, type Id, type Manuscript, type Suggestion } from "@/db/schema";
import { askAi, parseJson, requestStageReview } from "./ai";
import { sortChapters } from "./chapters";
import { seedRoadmap } from "./roadmap";
import { countWords, htmlToText } from "./text";
import { bookTypeOf } from "./bookTypes";
import { sanitizeDocument } from "./sanitize";

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
  const sourceChapters = sortChapters(
    (await db.chapters.where("manuscriptId").equals(source.id).toArray()).filter((chapter) => chapter.kind !== "scrap"),
  );
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

/**
 * Brings a translation's chapter list in line with its original: a chapter added to the
 * original since gets an empty chapter waiting to be translated, and every chapter takes
 * the original's section and place. Chapters already translated keep their text.
 * Returns how many chapters were added.
 */
export function syncTranslationChapters(translationId: Id): Promise<number> {
  return db.transaction("rw", db.manuscripts, db.chapters, async () => {
    const translation = await db.manuscripts.get(translationId);
    if (!translation?.translationOf) return 0;
    const [sources, existing] = await Promise.all([
      db.chapters.where("manuscriptId").equals(translation.translationOf).toArray(),
      db.chapters.where("manuscriptId").equals(translationId).toArray(),
    ]);
    const bySource = new Map(existing.filter((c) => c.sourceChapterId).map((c) => [c.sourceChapterId!, c]));
    const now = Date.now();
    let added = 0;
    for (const source of sources) {
      if (source.kind === "scrap") continue;
      const mine = bySource.get(source.id);
      if (!mine) {
        await db.chapters.add({
          id: newId(),
          manuscriptId: translationId,
          kind: source.kind,
          title: "",
          content: "",
          wordCount: 0,
          status: "draft",
          order: source.order,
          sourceChapterId: source.id,
          translationState: "pending",
          createdAt: now,
          updatedAt: now,
        });
        added++;
      } else if (mine.kind !== source.kind || mine.order !== source.order) {
        await db.chapters.update(mine.id, { kind: source.kind, order: source.order });
      }
    }
    return added;
  });
}

/** Inline elements sit inside a paragraph; any other element is a block. */
const INLINE_TAGS = new Set([
  "A", "ABBR", "B", "BDI", "BDO", "BR", "CITE", "CODE", "DEL", "DFN", "EM", "I", "IMG", "INS",
  "KBD", "MARK", "Q", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR",
]);

const isInline = (node: ChildNode) =>
  node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && INLINE_TAGS.has((node as Element).tagName));

/**
 * Text that sits directly in a container beside block elements (or directly in the
 * chapter, with no paragraph around it) is wrapped in a paragraph, so that every
 * piece of text belongs to a block the translator can reach. Without this, loose
 * text at the start of a chapter is left in the original language.
 */
function wrapLooseText(parent: Element, doc: Document): void {
  const hasBlockChild = Array.from(parent.childNodes).some((n) => n.nodeType === Node.ELEMENT_NODE && !isInline(n));
  if (hasBlockChild || parent === doc.body) {
    let run: ChildNode[] = [];
    const flush = () => {
      if (run.some((n) => (n.textContent ?? "").trim() !== "")) {
        const paragraph = doc.createElement("p");
        parent.insertBefore(paragraph, run[0]);
        for (const node of run) paragraph.appendChild(node);
      }
      run = [];
    };
    for (const node of Array.from(parent.childNodes)) {
      if (isInline(node)) run.push(node);
      else flush();
    }
    flush();
  }
  for (const child of Array.from(parent.children)) {
    if (!INLINE_TAGS.has(child.tagName)) wrapLooseText(child, doc);
  }
}

/** The text blocks of a chapter's HTML, in order, from a parsed copy of it: every block element that holds text itself. */
function textBlocks(doc: Document): Element[] {
  return Array.from(doc.body.querySelectorAll("*")).filter(
    (el) =>
      !INLINE_TAGS.has(el.tagName) &&
      !Array.from(el.children).some((child) => !INLINE_TAGS.has(child.tagName)) &&
      (el.textContent ?? "").trim() !== "",
  );
}

/** One request-sized piece of a block's HTML, and what joined it to the next piece in the original. */
interface Piece {
  item: number;
  html: string;
  /** " " when the original had a space after this piece, "" when the cut was mid-word. */
  joiner: string;
}

/** True when position `i` of `html` is inside a tag such as <em class="x">. */
function insideTag(html: string, i: number): boolean {
  return html.lastIndexOf("<", i) > html.lastIndexOf(">", i);
}

/**
 * Splits one block's HTML into pieces under `limit` characters (F20): at a sentence end
 * where it can, else at a space, never inside a tag. A tag that opens in one piece and
 * closes in another is fine: the pieces are joined again before the HTML is read.
 */
export function splitLongBlock(html: string, limit: number): { html: string; joiner: string }[] {
  const pieces: { html: string; joiner: string }[] = [];
  let rest = html;
  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    let cut = -1;
    for (let i = window.length - 2; i > 0 && cut === -1; i--) {
      if (".!?".includes(window[i]) && window[i + 1] === " " && !insideTag(window, i)) cut = i + 1;
    }
    for (let i = window.length - 1; i > 0 && cut === -1; i--) {
      if (window[i] === " " && !insideTag(window, i)) cut = i;
    }
    if (cut === -1) cut = insideTag(window, limit - 1) ? window.lastIndexOf("<") : limit;
    if (cut <= 0) cut = limit;
    const spaced = rest[cut] === " ";
    pieces.push({ html: rest.slice(0, cut), joiner: spaced ? " " : "" });
    rest = spaced ? rest.slice(cut + 1) : rest.slice(cut);
  }
  pieces.push({ html: rest, joiner: "" });
  return pieces;
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
  wrapLooseText(parsed.body, parsed);
  const blocks = textBlocks(parsed);
  const sourceTitle = source.title.trim();
  const items: string[] = [];
  if (sourceTitle) items.push(sourceTitle);
  for (const block of blocks) items.push(block.innerHTML);
  if (items.length === 0) throw new Error("This chapter has no text to translate yet.");

  // A block longer than one request is split into pieces, translated, and joined again.
  const pieces: Piece[] = items.flatMap((html, item) =>
    splitLongBlock(html, BATCH_CHARACTERS).map((piece) => ({ item, ...piece })),
  );
  const translatedPieces: string[] = [];
  for (const batch of batchesOf(pieces.map((p) => p.html))) {
    // Batches run one after another, so the chapter is never sent as one long request.
    translatedPieces.push(...(await translateBatch(settings, batch, target)));
  }
  const translated: string[] = items.map(() => "");
  pieces.forEach((piece, i) => {
    translated[piece.item] += translatedPieces[i].trim() + piece.joiner;
  });

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
  sanitizeDocument(parsed);
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
