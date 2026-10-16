import JSZip from "jszip";
import { escapeHtml } from "./text";

/**
 * Reading files the author brings in: plain text, Markdown, HTML, Word (.docx) and epub.
 * Every reader turns its file into the same simple shape, a list of blocks (headings,
 * paragraphs, quotes, scene breaks), so the manuscript import, the outline import and the
 * research repository can all use the same code.
 */

export type DocBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; html: string; text: string; list?: number }
  | { type: "quote"; html: string; text: string }
  | { type: "break" };

export interface ReadDocument {
  /** The title found in the file's own metadata, if it has one. */
  title?: string;
  author?: string;
  language?: string;
  description?: string;
  keywords?: string[];
  blocks: DocBlock[];
  /** For epub: the file's own parts in reading order, so each can become a chapter. */
  parts?: { title: string; blocks: DocBlock[] }[];
}

export const IMPORT_EXTENSIONS = [".txt", ".md", ".markdown", ".html", ".htm", ".docx", ".epub"];
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.join(",");

export function extensionOf(name: string): string {
  const at = name.lastIndexOf(".");
  return at === -1 ? "" : name.slice(at).toLowerCase();
}

/** A readable title from a file name: "my_great-book.docx" becomes "my great book". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base || "Imported manuscript";
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const BREAK_LINE = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|#|~{3,}|[\u25c6\u2766\u2042]+|\*\s\*\s\*)\s*$/;

export function isBreakLine(text: string): boolean {
  return BREAK_LINE.test(text);
}

const NUMBER_WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred";
const CHAPTER_WORD = new RegExp(`^chapter\\s+(?:\\d+|[ivxlc]+|(?:${NUMBER_WORDS})(?:[-\\s](?:${NUMBER_WORDS}))*)\\b`, "i");
const SECTION_WORD = /^(?:prologue|epilogue|part\s+(?:\d+|[ivxlc]+|one|two|three|four|five)|book\s+(?:\d+|[ivxlc]+|one|two|three))\b/i;

/** A short line such as "Chapter 4" or "CHAPTER ONE: The Storm" that is really a heading. */
export function looksLikeChapterHeading(text: string): boolean {
  const line = text.trim();
  if (!line || line.length > 70 || /[.!?]$/.test(line)) return false;
  return CHAPTER_WORD.test(line) || SECTION_WORD.test(line);
}

function textOf(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\u00a0/g, " ").trim() ?? "";
}

function paragraph(html: string): DocBlock | null {
  const text = textOf(html);
  if (!text) return null;
  return isBreakLine(text) ? { type: "break" } : { type: "paragraph", html, text };
}

/** A list item: shown with a bullet in the book, and remembered as an item at `level` for the outline reader. */
function listItem(html: string, level: number): DocBlock | null {
  const text = textOf(html);
  if (!text) return null;
  return { type: "paragraph", html: `\u2022 ${html}`, text, list: Math.max(0, level) };
}

/** Inline Markdown (**bold**, *italic*, _italic_) to HTML. The rest of the text is escaped. */
function inlineMarkdown(line: string): string {
  return escapeHtml(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_\w])_(?!\s)(.+?)(?<!\s)_(?![_\w])/g, "$1<em>$2</em>");
}

// ---------------------------------------------------------------------------
// Plain text and Markdown
// ---------------------------------------------------------------------------

export function readPlainText(source: string, markdown: boolean): DocBlock[] {
  const text = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks: DocBlock[] = [];
  const hasBlankLines = /\n\s*\n/.test(text);
  const chunks = hasBlankLines ? text.split(/\n\s*\n/) : text.split("\n");

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map((l) => l.trimEnd());
    // A chunk can hold a heading line followed by text with no blank line between.
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const joined = run.map((l) => l.trim()).join(" ").trim();
      run = [];
      if (!joined) return;
      const html = markdown ? inlineMarkdown(joined) : escapeHtml(joined);
      const block = paragraph(html);
      if (block) blocks.push(block);
    };
    for (const line of lines) {
      const heading = markdown ? /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line) : null;
      if (heading) {
        flush();
        blocks.push({ type: "heading", level: Math.min(3, heading[1].length) as 1 | 2 | 3, text: heading[2] });
      } else if (markdown && /^>\s?/.test(line)) {
        flush();
        const quote = line.replace(/^>\s?/, "").trim();
        if (quote) blocks.push({ type: "quote", html: inlineMarkdown(quote), text: quote });
      } else if (looksLikeChapterHeading(line)) {
        flush();
        blocks.push({ type: "heading", level: 1, text: line.trim() });
      } else if (!line.trim()) {
        flush();
      } else if (markdown && /^(?:[-*+]|\d+[.)])\s+/.test(line)) {
        flush();
        run.push(line.replace(/^(?:[-*+]|\d+[.)])\s+/, "\u2022 "));
        flush();
      } else {
        run.push(line);
      }
    }
    flush();
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// HTML (also each part of an epub)
// ---------------------------------------------------------------------------

/** Keeps bold, italic, underline and line breaks; everything else is flattened to its text. */
function inlineHtml(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += escapeHtml((child.textContent ?? "").replace(/\s+/g, " "));
    } else if (child instanceof Element) {
      const tag = child.tagName.toLowerCase();
      const inner = inlineHtml(child);
      if (tag === "strong" || tag === "b") out += `<strong>${inner}</strong>`;
      else if (tag === "em" || tag === "i") out += `<em>${inner}</em>`;
      else if (tag === "u") out += `<u>${inner}</u>`;
      else if (tag === "br") out += "<br>";
      else if (tag !== "script" && tag !== "style") out += inner;
    }
  });
  return out.trim();
}

const HEADING_LEVEL: Record<string, 1 | 2 | 3> = { h1: 1, h2: 2, h3: 3, h4: 3, h5: 3, h6: 3 };

function walkHtml(parent: Element, blocks: DocBlock[]): void {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag in HEADING_LEVEL) {
      const text = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ type: "heading", level: HEADING_LEVEL[tag], text });
    } else if (tag === "p") {
      const block = paragraph(inlineHtml(child));
      if (block) blocks.push(block);
    } else if (tag === "hr") {
      blocks.push({ type: "break" });
    } else if (tag === "blockquote") {
      const html = inlineHtml(child);
      const text = textOf(html);
      if (text) blocks.push({ type: "quote", html, text });
    } else if (tag === "li") {
      let depth = 0;
      for (let up = child.parentElement; up; up = up.parentElement) {
        if (up.tagName === "UL" || up.tagName === "OL") depth++;
      }
      const block = listItem(inlineHtml(child), depth - 1);
      if (block) blocks.push(block);
    } else if (["script", "style", "head", "nav", "svg", "img", "figure"].includes(tag)) {
      continue;
    } else if (child.querySelector("p,h1,h2,h3,h4,h5,h6,li,blockquote,hr")) {
      walkHtml(child, blocks);
    } else {
      const block = paragraph(inlineHtml(child));
      if (block) blocks.push(block);
    }
  }
}

export function readHtml(source: string): { title?: string; blocks: DocBlock[] } {
  const doc = new DOMParser().parseFromString(source, "text/html");
  const blocks: DocBlock[] = [];
  walkHtml(doc.body, blocks);
  const title = doc.querySelector("title")?.textContent?.trim();
  return { title: title || undefined, blocks };
}

// ---------------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------------

function wordFlag(rPr: Element | null, tag: string): boolean {
  const el = rPr?.getElementsByTagName(tag)[0];
  if (!el) return false;
  const value = el.getAttribute("w:val");
  return value !== "0" && value !== "false";
}

async function readDocx(file: File): Promise<ReadDocument> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const main = zip.file("word/document.xml");
  if (!main) throw new Error("That file is not a Word document (.docx) this app can read.");
  const xml = new DOMParser().parseFromString(await main.async("string"), "application/xml");
  const blocks: DocBlock[] = [];
  let title: string | undefined;

  for (const p of Array.from(xml.getElementsByTagName("w:p"))) {
    const style = p.getElementsByTagName("w:pStyle")[0]?.getAttribute("w:val") ?? "";
    let html = "";
    let plain = "";
    for (const run of Array.from(p.getElementsByTagName("w:r"))) {
      const rPr = Array.from(run.children).find((c) => c.tagName === "w:rPr") ?? null;
      let piece = "";
      let pieceText = "";
      for (const part of Array.from(run.children)) {
        if (part.tagName === "w:t") {
          pieceText += part.textContent ?? "";
          piece += escapeHtml(part.textContent ?? "");
        } else if (part.tagName === "w:tab") {
          pieceText += " ";
          piece += " ";
        } else if (part.tagName === "w:br" && part.getAttribute("w:type") !== "page") {
          pieceText += " ";
          piece += "<br>";
        }
      }
      if (!piece) continue;
      plain += pieceText;
      if (wordFlag(rPr, "w:i")) piece = `<em>${piece}</em>`;
      if (wordFlag(rPr, "w:b")) piece = `<strong>${piece}</strong>`;
      html += piece;
    }
    const text = plain.replace(/\s+/g, " ").trim();
    if (!text) continue;

    const level = /^Heading\s?([1-6])$/i.exec(style);
    if (/^title$/i.test(style)) {
      title ??= text;
    } else if (level) {
      blocks.push({ type: "heading", level: Math.min(3, Number(level[1])) as 1 | 2 | 3, text });
    } else if (looksLikeChapterHeading(text)) {
      blocks.push({ type: "heading", level: 1, text });
    } else if (/^(?:Quote|IntenseQuote|BlockText)$/i.test(style)) {
      blocks.push({ type: "quote", html: html.trim(), text });
    } else if (p.getElementsByTagName("w:numPr").length > 0) {
      const block = listItem(html.trim(), Number(p.getElementsByTagName("w:ilvl")[0]?.getAttribute("w:val") ?? 0));
      if (block) blocks.push(block);
    } else {
      const block = paragraph(html.trim());
      if (block) blocks.push(block);
    }
  }

  const core = zip.file("docProps/core.xml");
  if (!title && core) {
    const meta = new DOMParser().parseFromString(await core.async("string"), "application/xml");
    title = meta.getElementsByTagName("dc:title")[0]?.textContent?.trim() || undefined;
  }
  return { title, blocks };
}

// ---------------------------------------------------------------------------
// epub
// ---------------------------------------------------------------------------

function resolveInZip(base: string, href: string): string {
  const parts = base.split("/").slice(0, -1);
  for (const piece of decodeURIComponent(href.split("#")[0]).split("/")) {
    if (piece === "..") parts.pop();
    else if (piece && piece !== ".") parts.push(piece);
  }
  return parts.join("/");
}

async function readEpub(file: File): Promise<ReadDocument> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error("That file is not an epub this app can read.");
  const containerXml = new DOMParser().parseFromString(await container.async("string"), "application/xml");
  const opfPath = containerXml.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
  const opfFile = opfPath ? zip.file(opfPath) : null;
  if (!opfPath || !opfFile) throw new Error("That file is not an epub this app can read.");
  const opf = new DOMParser().parseFromString(await opfFile.async("string"), "application/xml");

  const manifest = new Map<string, { href: string; properties: string }>();
  for (const item of Array.from(opf.getElementsByTagName("item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, { href, properties: item.getAttribute("properties") ?? "" });
  }

  const meta = (name: string) => opf.getElementsByTagName(`dc:${name}`)[0]?.textContent?.trim() || undefined;
  const parts: { title: string; blocks: DocBlock[] }[] = [];
  for (const ref of Array.from(opf.getElementsByTagName("itemref"))) {
    const entry = manifest.get(ref.getAttribute("idref") ?? "");
    if (!entry || /\bnav\b/.test(entry.properties)) continue;
    const page = zip.file(resolveInZip(opfPath, entry.href));
    if (!page) continue;
    const { title, blocks } = readHtml(await page.async("string"));
    if (blocks.length === 0) continue;
    const heading = blocks.find((b): b is Extract<DocBlock, { type: "heading" }> => b.type === "heading");
    parts.push({ title: heading?.text ?? title ?? "", blocks });
  }

  return {
    title: meta("title"),
    author: meta("creator"),
    language: meta("language"),
    description: meta("description"),
    keywords: Array.from(opf.getElementsByTagName("dc:subject"))
      .map((s) => s.textContent?.trim() ?? "")
      .filter(Boolean),
    blocks: parts.flatMap((p) => p.blocks),
    parts,
  };
}

// ---------------------------------------------------------------------------
// One entry point
// ---------------------------------------------------------------------------

/** Reads a file the author chose. Throws a plain message for a file type that cannot be read. */
export async function readDocument(file: File): Promise<ReadDocument> {
  const extension = extensionOf(file.name);
  switch (extension) {
    case ".txt":
      return { blocks: readPlainText(await file.text(), false) };
    case ".md":
    case ".markdown":
      return { blocks: readPlainText(await file.text(), true) };
    case ".html":
    case ".htm":
      return readHtml(await file.text());
    case ".docx":
      return readDocx(file);
    case ".epub":
      return readEpub(file);
    default:
      throw new Error("That file type cannot be read. Use .txt, .md, .html, .docx or .epub.");
  }
}

/** The document as plain text, with headings marked by # signs and list items by "- ". Used to hand a file's text to the outline reader and the research notes. */
export function documentToText(doc: ReadDocument): string {
  let out = "";
  let previousWasList = false;
  for (const block of doc.blocks) {
    const isList = block.type === "paragraph" && block.list !== undefined;
    let line: string;
    if (block.type === "heading") line = `${"#".repeat(block.level)} ${block.text}`;
    else if (block.type === "break") line = "* * *";
    else if (block.type === "paragraph" && block.list !== undefined) line = `${"  ".repeat(block.list)}- ${block.text}`;
    else line = block.text;
    out += out ? (isList && previousWasList ? "\n" : "\n\n") : "";
    out += line;
    previousWasList = isList;
  }
  return out;
}