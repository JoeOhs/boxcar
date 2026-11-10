export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text of a chapter's HTML, with a line break between paragraphs. */
export function htmlToText(html: string): string {
  const spaced = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|h[1-6]|li|blockquote)>/gi, "$&\n")
    .replace(/<hr\s*\/?>/gi, "\n* * *\n");
  const doc = new DOMParser().parseFromString(spaced, "text/html");
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
}

export function countWords(html: string): number {
  const text = htmlToText(html);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function textToParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

const BLOCK_SELECTOR = "p,h1,h2,h3,h4,h5,h6,li,blockquote,div";

/** What happened when a suggestion's passage was looked for in the chapter. */
export type ReplaceResult = { ok: true; html: string } | { ok: false; reason: "missing" | "ambiguous" };

/** Positions of `needle` in `haystack`, including overlapping ones. */
function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) found.push(at);
  return found;
}

/** The text node and offset inside `block` at character `offset` of its text. */
function pointAt(block: Element, offset: number, preferNext: boolean): { node: Text; offset: number } {
  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.data.length;
    // At a boundary between two nodes, the start of a range belongs to the next node, the end to this one.
    if (offset < seen + length || (offset === seen + length && !preferNext)) return { node, offset: offset - seen };
    seen += length;
    last = node;
  }
  return { node: last!, offset: last!.data.length };
}

/**
 * Replaces `original` in the chapter HTML, only when it appears exactly once.
 * The passage is matched within one paragraph (it may cross bold, italics or links);
 * only the matched characters are replaced, so the formatting around them is kept.
 */
export function replaceInHtml(html: string, original: string, replacement: string): ReplaceResult {
  if (!original) return { ok: false, reason: "missing" };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = Array.from(doc.body.querySelectorAll(BLOCK_SELECTOR)).filter((el) => !el.querySelector(BLOCK_SELECTOR));
  // Text outside any block (an older chapter with bare text) is searched as one block too.
  if (blocks.length === 0) blocks.push(doc.body);
  // The AI reads the chapter with non-breaking spaces turned into spaces (htmlToText), so match the same way.
  const needle = original.replace(/ /g, " ");

  const matches: { block: Element; at: number }[] = [];
  for (const block of blocks) {
    for (const at of occurrences((block.textContent ?? "").replace(/ /g, " "), needle)) matches.push({ block, at });
  }
  if (matches.length === 0) return { ok: false, reason: "missing" };
  if (matches.length > 1) return { ok: false, reason: "ambiguous" };

  const { block, at } = matches[0];
  const start = pointAt(block, at, true);
  const end = pointAt(block, at + needle.length, false);
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  range.deleteContents();
  if (replacement) range.insertNode(doc.createTextNode(replacement));
  // Deleting across formatting can leave empty wrappers such as <em></em> behind.
  block.querySelectorAll("*").forEach((el) => {
    if (!el.textContent && !el.querySelector("img,br") && !["IMG", "BR", "HR"].includes(el.tagName)) el.remove();
  });
  block.normalize();
  return { ok: true, html: doc.body.innerHTML };
}

export interface DiffLine {
  type: "same" | "removed" | "added";
  text: string;
}

/** Paragraph-level diff (longest common subsequence). */
export function diffParagraphs(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ type: "same", text: before[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ type: "removed", text: before[i] });
      i++;
    } else {
      out.push({ type: "added", text: after[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "removed", text: before[i++] });
  while (j < m) out.push({ type: "added", text: after[j++] });
  return out;
}
