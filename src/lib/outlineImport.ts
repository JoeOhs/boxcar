import type { OutlineKind } from "@/db/schema";
import type { ReadDocument } from "./documents";
import { countNodes, type OutlineNode } from "./outline";

/**
 * Reads an outline out of an imported file, without an AI, from the structure the file already has:
 * headings give the levels (the highest level in a file that also has nested headings becomes acts),
 * bulleted or numbered lists give the points beneath each heading, and the first paragraph under a
 * heading becomes its summary.
 */

const MAX_TITLE = 160;
const MAX_SUMMARY = 400;

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}...` : clean;
}

/** What a child of a node of this kind should be, following the usual nesting of outlines. */
function kindBelow(parent: OutlineKind | null): OutlineKind {
  switch (parent) {
    case null:
      return "chapter";
    case "act":
      return "chapter";
    case "chapter":
      return "scene";
    default:
      return "beat";
  }
}

function newNode(kind: OutlineKind, title: string): OutlineNode {
  return { kind, title: clip(title, MAX_TITLE), summary: "", children: [] };
}

function addSummary(node: OutlineNode, text: string): void {
  if (node.summary.length >= MAX_SUMMARY) return;
  node.summary = clip(node.summary ? `${node.summary} ${text}` : text, MAX_SUMMARY);
}

export function outlineFromDocument(doc: ReadDocument): OutlineNode[] {
  const headingLevels = Array.from(
    new Set(doc.blocks.flatMap((b) => (b.type === "heading" ? [b.level] : []))),
  ).sort((a, b) => a - b);
  // With two or more heading levels the top one is the act; with one level, each heading is a chapter.
  const headingKinds: OutlineKind[] = headingLevels.length >= 2 ? ["act", "chapter", "scene", "beat"] : ["chapter", "scene", "beat"];
  const kindForLevel = (level: 1 | 2 | 3): OutlineKind => headingKinds[Math.min(headingLevels.indexOf(level), headingKinds.length - 1)];

  const roots: OutlineNode[] = [];
  // The open headings, outermost first. Each one's depth is its position in this stack.
  const headingStack: { level: number; node: OutlineNode }[] = [];
  // The open list items: listStack[k] is the item at nesting level k of the current list.
  let listStack: OutlineNode[] = [];

  const currentHeading = () => headingStack[headingStack.length - 1]?.node;
  const addUnderHeading = (node: OutlineNode) => {
    const parent = currentHeading();
    (parent ? parent.children : roots).push(node);
  };

  for (const block of doc.blocks) {
    if (block.type === "heading") {
      listStack = [];
      const node = newNode(kindForLevel(block.level), block.text);
      while (headingStack.length && headingStack[headingStack.length - 1].level >= block.level) headingStack.pop();
      const parent = currentHeading();
      (parent ? parent.children : roots).push(node);
      headingStack.push({ level: block.level, node });
    } else if (block.type === "paragraph" && block.list !== undefined) {
      const depth = Math.max(0, block.list);
      const text = block.text.replace(/^[\u2022\-*]\s*/, "");
      // A list item nests under the item one level up, or under the open heading at the top level.
      listStack = listStack.slice(0, depth);
      const parent = depth === 0 ? currentHeading() : listStack[depth - 1];
      const parentKind = parent ? parent.kind : null;
      const node = newNode(kindBelow(parentKind), text);
      if (parent) parent.children.push(node);
      else addUnderHeading(node);
      listStack[depth] = node;
    } else if (block.type === "paragraph" || block.type === "quote") {
      listStack = [];
      const owner = currentHeading();
      if (owner) addSummary(owner, block.text);
    }
    // Scene breaks carry no outline content.
  }

  return roots;
}

/** Reads the outline from a document, or explains why it found none. */
export function readOutline(doc: ReadDocument): { nodes: OutlineNode[]; count: number } {
  const nodes = outlineFromDocument(doc);
  const count = countNodes(nodes);
  if (count === 0) {
    throw new Error("No outline found in this file. Use headings (such as Chapter 1 or # Heading) or a bulleted list.");
  }
  return { nodes, count };
}
