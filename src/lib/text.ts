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
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "$&\n")
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

/**
 * Replaces the first occurrence of `original` in the chapter HTML.
 * Tries a single text node first (keeps all formatting); if the passage spans
 * formatting inside one paragraph, the paragraph is rewritten as plain text.
 * Returns null when the passage is not found.
 */
export function replaceInHtml(html: string, original: string, replacement: string): string | null {
  if (!original) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? "";
    const at = value.indexOf(original);
    if (at !== -1) {
      node.nodeValue = value.slice(0, at) + replacement + value.slice(at + original.length);
      return doc.body.innerHTML;
    }
    node = walker.nextNode();
  }

  const blocks = Array.from(doc.body.querySelectorAll(BLOCK_SELECTOR)).filter(
    (el) => !el.querySelector(BLOCK_SELECTOR),
  );
  for (const block of blocks) {
    const value = block.textContent ?? "";
    const at = value.indexOf(original);
    if (at !== -1) {
      block.textContent = value.slice(0, at) + replacement + value.slice(at + original.length);
      return doc.body.innerHTML;
    }
  }
  return null;
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
