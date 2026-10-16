import type { ChapterKind, Manuscript, Workspace } from "@/db/schema";
import { readDocument, titleFromFileName, type DocBlock, type ReadDocument } from "./documents";
import { createManuscript, createChapter, patchManuscript } from "./store";
import { countWords, escapeHtml } from "./text";

/** One chapter found in an imported file. */
export interface ImportedChapter {
  kind: ChapterKind;
  title: string;
  html: string;
}

export interface ImportPlan {
  title: string;
  author?: string;
  language?: string;
  description?: string;
  keywords: string[];
  chapters: ImportedChapter[];
}

const FRONT = /^(dedication|epigraph|foreword|preface)$/i;
const BACK = /^(acknowledg(e)?ments?|about the authors?|afterword|also by.*|authors?'? note|appendix.*|glossary|bibliography|notes)$/i;
const SKIPPED = /^(contents|table of contents|title page|copyright|copyright page|cover)$/i;

/** "Chapter 3" -> "" (chapters are numbered by the book); "Chapter 3: The Storm" -> "The Storm". */
function chapterTitle(heading: string): string {
  const match = /^chapter\s+(?:\d+|[ivxlc]+|[a-z-]+(?:\s[a-z-]+)?)\s*(?:[:.\-\u2013\u2014]\s*(.*))?$/i.exec(heading.trim());
  if (!match) return heading.trim();
  return (match[1] ?? "").trim();
}

function blocksToHtml(blocks: DocBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<h2>${escapeHtml(block.text)}</h2>`;
        case "break":
          return "<hr>";
        case "quote":
          return `<blockquote>${block.html}</blockquote>`;
        case "paragraph":
          return `<p>${block.html}</p>`;
      }
    })
    .join("");
}

function kindFor(title: string): ChapterKind {
  if (FRONT.test(title.trim())) return "front";
  if (BACK.test(title.trim())) return "back";
  return "chapter";
}

/** Cuts a run of blocks into chapters at its headings. */
function splitByHeadings(blocks: DocBlock[]): { chapters: ImportedChapter[]; leading: DocBlock[]; title?: string } {
  const levels = blocks.filter((b): b is Extract<DocBlock, { type: "heading" }> => b.type === "heading").map((b) => b.level);
  if (levels.length === 0) return { chapters: [], leading: blocks };

  // A single top heading at the very start is the book's title; chapters then start at the next level.
  const topLevel = Math.min(...levels) as 1 | 2 | 3;
  const topCount = levels.filter((l) => l === topLevel).length;
  let title: string | undefined;
  let body = blocks;
  let splitLevel = topLevel;
  const first = blocks[0];
  if (first.type === "heading" && first.level === topLevel && topCount === 1 && levels.some((l) => l > topLevel)) {
    title = first.text;
    body = blocks.slice(1);
    splitLevel = Math.min(...levels.filter((l) => l > topLevel)) as 1 | 2 | 3;
  }

  const chapters: ImportedChapter[] = [];
  let leading: DocBlock[] = [];
  let current: { heading: string; blocks: DocBlock[] } | null = null;
  const close = () => {
    if (!current) return;
    const heading = current.heading;
    if (!SKIPPED.test(heading.trim())) {
      chapters.push({ kind: kindFor(heading), title: kindFor(heading) === "chapter" ? chapterTitle(heading) : heading.trim(), html: blocksToHtml(current.blocks) });
    }
    current = null;
  };
  for (const block of body) {
    if (block.type === "heading" && block.level <= splitLevel) {
      close();
      current = { heading: block.text, blocks: [] };
    } else if (current) {
      current.blocks.push(block);
    } else {
      leading.push(block);
    }
  }
  close();
  if (leading.length > 0 && chapters.length === 0) leading = body;
  return { chapters, leading, title };
}

/** Works out the book inside a file: its title, its metadata and its chapters. */
export async function planImport(file: File): Promise<ImportPlan> {
  const doc: ReadDocument = await readDocument(file);
  let chapters: ImportedChapter[] = [];
  let title = doc.title;

  if (doc.parts && doc.parts.length > 0) {
    // An epub is already cut into parts, one per file in its reading order.
    for (const part of doc.parts) {
      const heading = part.title.trim();
      if (SKIPPED.test(heading)) continue;
      const firstIsHeading = part.blocks[0]?.type === "heading";
      const body = firstIsHeading ? part.blocks.slice(1) : part.blocks;
      if (body.length === 0 && firstIsHeading) continue;
      const kind = kindFor(heading);
      chapters.push({ kind, title: kind === "chapter" ? chapterTitle(heading) : heading, html: blocksToHtml(body) });
    }
  } else {
    const split = splitByHeadings(doc.blocks);
    title = title ?? split.title;
    chapters = split.chapters;
    const leadingWords = countWords(blocksToHtml(split.leading));
    if (chapters.length === 0) {
      chapters = [{ kind: "chapter", title: "", html: blocksToHtml(split.leading) }];
    } else if (leadingWords >= 25) {
      chapters.unshift({ kind: "chapter", title: "", html: blocksToHtml(split.leading) });
    } else if (!title && split.leading[0]?.type === "paragraph") {
      // A few short lines before the first heading are the title page.
      title = split.leading[0].text;
    }
  }

  chapters = chapters.filter((c) => countWords(c.html) > 0);
  if (chapters.length === 0) throw new Error("No text was found in that file.");

  return {
    title: (title ?? titleFromFileName(file.name)).trim() || titleFromFileName(file.name),
    author: doc.author,
    language: doc.language,
    description: doc.description,
    keywords: doc.keywords ?? [],
    chapters,
  };
}

/** Creates the manuscript and its chapters in a workspace. */
export async function importManuscript(workspace: Workspace, plan: ImportPlan, title = plan.title): Promise<Manuscript> {
  const manuscript = await createManuscript(workspace, title);
  for (const chapter of plan.chapters) {
    await createChapter(manuscript.id, chapter.kind, chapter.title, chapter.html);
  }
  await patchManuscript(manuscript.id, {
    status: "drafting",
    description: plan.description ?? "",
    keywords: plan.keywords.slice(0, 7),
    language: plan.language?.trim() || "en",
  });
  return manuscript;
}
