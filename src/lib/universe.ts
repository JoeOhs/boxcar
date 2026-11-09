import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  newId,
  type AiSettings,
  type Id,
  type Manuscript,
  type OutlineKind,
  type UniverseField,
  type UniverseNode,
  type UniverseNodeKind,
} from "@/db/schema";
import { askAi, parseJson } from "./ai";
import type { OutlineNode } from "./outline";
import { addOutlineTree } from "./store";

/**
 * The Universe: the wiki-style second brain behind a book. Every character,
 * place, situation, rule of magic, weapon or faction is a node with tags, an
 * expandable set of labelled fields, and links to the nodes it touches. The
 * Outliner reads it and can turn it into an outline.
 */

export const UNIVERSE_KINDS: UniverseNodeKind[] = ["character", "location", "situation", "concept", "item", "faction", "event"];

export const UNIVERSE_KIND_LABEL: Record<UniverseNodeKind, string> = {
  character: "Character",
  location: "Location",
  situation: "Situation",
  concept: "Concept",
  item: "Item",
  faction: "Faction",
  event: "Event",
};

export const UNIVERSE_KIND_PLURAL: Record<UniverseNodeKind, string> = {
  character: "Characters",
  location: "Locations",
  situation: "Situations",
  concept: "Concepts",
  item: "Items",
  faction: "Factions",
  event: "Events",
};

/** The fields a character starts with, from personality to clothing and handicaps. */
export const CHARACTER_FIELD_LABELS = [
  "Role in the story",
  "Personality type",
  "Strengths",
  "Flaws",
  "Appearance",
  "Clothing preferences",
  "Handicaps",
  "Background",
  "Goals",
  "Secret",
  "Voice and speech",
];

export function characterFields(): UniverseField[] {
  return CHARACTER_FIELD_LABELS.map((label) => ({ id: newId(), label, value: "" }));
}

/** A field the author adds by hand. */
export function newField(label = "", value = ""): UniverseField {
  return { id: newId(), label, value };
}

/** The colour a tag gives its nodes: a stable hue taken from the tag's name. */
export function tagHue(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) % 360;
  return hash;
}

/** The colour of a tag as inline styles, so any tag a writer invents gets one. */
export function tagStyle(tag: string): { backgroundColor: string; color: string } {
  const hue = tagHue(tag);
  return { backgroundColor: `hsl(${hue} 42% 42%)`, color: "#fff" };
}

/** A node takes the colour of its first tag, if it has one. */
export function nodeColor(node: UniverseNode): string | undefined {
  return node.tags.length > 0 ? `hsl(${tagHue(node.tags[0])} 42% 42%)` : undefined;
}

/** The Universe of a book, oldest first. undefined while loading. */
export function useUniverseNodes(manuscriptId: Id): UniverseNode[] | undefined {
  return useLiveQuery(() => db.universeNodes.where("manuscriptId").equals(manuscriptId).sortBy("createdAt"), [manuscriptId]);
}

export async function createUniverseNode(manuscriptId: Id, kind: UniverseNodeKind): Promise<UniverseNode> {
  const now = Date.now();
  const node: UniverseNode = {
    id: newId(),
    manuscriptId,
    kind,
    name: "",
    summary: "",
    tags: [],
    fields: kind === "character" ? characterFields() : [],
    links: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.universeNodes.add(node);
  return node;
}

export async function patchUniverseNode(
  id: Id,
  changes: Partial<Pick<UniverseNode, "name" | "summary" | "kind" | "tags" | "fields" | "links" | "image">>,
): Promise<void> {
  await db.universeNodes.update(id, { ...changes, updatedAt: Date.now() });
}

/**
 * The prompt for the node's artistic rendering: a portrait for a character, a
 * landscape for a location. Painted by the author's image AI in the Universe.
 */
export function nodeArtworkPrompt(node: UniverseNode, bookTitle: string): string {
  const name = node.name.trim() || "Unnamed";
  const appearance = node.fields.find((field) => /appearance/i.test(field.label) && field.value.trim())?.value.trim();
  const detail = node.summary.trim();
  if (node.kind === "character") {
    return [
      `An artistic character portrait of "${name}", a character in the book "${bookTitle}".`,
      appearance ? `Appearance: ${appearance}.` : "",
      detail ? `Who they are: ${detail}.` : "",
      "Painterly digital artwork, head and shoulders, full of character. No text, letters or words anywhere in the picture.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `An artistic landscape rendering of "${name}", a location in the book "${bookTitle}".`,
    detail ? `What it is like: ${detail}.` : "",
    "A wide establishing view, like a film's first shot of the place. No text, letters or words anywhere in the picture.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Deletes a node and takes it out of every node that linked to it. */
export async function deleteUniverseNode(id: Id): Promise<void> {
  await db.transaction("rw", db.universeNodes, async () => {
    const node = await db.universeNodes.get(id);
    if (!node) return;
    const linked = await db.universeNodes.where("manuscriptId").equals(node.manuscriptId).filter((other) => other.links.includes(id)).toArray();
    for (const other of linked) {
      await db.universeNodes.update(other.id, { links: other.links.filter((link) => link !== id), updatedAt: Date.now() });
    }
    await db.universeNodes.delete(id);
  });
}

const LINE_BREAK = String.fromCharCode(10);

/** The Universe as plain text for the AI staff: one block per node with its tags, fields and links. */
export function universeToText(nodes: UniverseNode[]): string {
  if (nodes.length === 0) return "";
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodes
    .map((node) => {
      const head = `[${UNIVERSE_KIND_LABEL[node.kind]}] ${node.name.trim() || "Untitled"}`;
      const tags = node.tags.length > 0 ? ` (tags: ${node.tags.join(", ")})` : "";
      const summary = node.summary.trim() ? LINE_BREAK + node.summary.trim() : "";
      const fields = node.fields
        .filter((field) => field.label.trim() || field.value.trim())
        .map((field) => `${field.label.trim() || "Detail"}: ${field.value.trim()}`)
        .join(LINE_BREAK);
      const links = node.links
        .map((id) => byId.get(id)?.name.trim())
        .filter(Boolean)
        .join(", ");
      const linksLine = links ? `${LINE_BREAK}Connects to: ${links}` : "";
      return [head + tags + summary, fields, linksLine.replace(/^\n/, "")].filter(Boolean).join(LINE_BREAK);
    })
    .join(LINE_BREAK + LINE_BREAK);
}

const OUTLINE_KINDS: OutlineKind[] = ["act", "chapter", "scene", "beat"];

function nodesFromReply(value: unknown, depth = 0): OutlineNode[] {
  if (!Array.isArray(value) || depth > 3) return [];
  const nodes: OutlineNode[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    if (!title) continue;
    const kind = typeof record.kind === "string" && OUTLINE_KINDS.includes(record.kind as OutlineKind) ? (record.kind as OutlineKind) : depth === 0 ? "chapter" : "scene";
    nodes.push({
      kind,
      title,
      summary: typeof record.summary === "string" ? record.summary.trim() : "",
      children: nodesFromReply(record.children, depth + 1),
    });
  }
  return nodes;
}

/**
 * Asks the Outliner to build an outline from the Universe, and adds it to the
 * book's outline. Returns how many items were added.
 */
export async function outlineFromUniverse(settings: AiSettings, manuscript: Manuscript, nodes: UniverseNode[]): Promise<number> {
  if (nodes.length === 0) throw new Error("Build a few Universe nodes first: the Outliner needs something to work from.");
  const prompt =
    `Build a book outline from the Universe below, for the book "${manuscript.title}".\n\n` +
    `THE UNIVERSE:\n${universeToText(nodes)}\n\n` +
    `Reply with ONLY a JSON array (no prose, no code fences) of outline nodes. Each node has the keys ` +
    `"kind" (one of "act", "chapter", "scene", "beat"), "title", "summary" and "children" (an array of the same shape). ` +
    `Use the characters, places, situations and rules in the Universe, and keep the structure in a sensible order.`;
  const reply = await askAi(settings, "You are the Outliner at a small publishing house. You turn a well-built story universe into a clear, workable outline.", [
    { role: "user", content: prompt },
  ]);
  const tree = nodesFromReply(parseJson(reply, "["));
  if (tree.length === 0) throw new Error("The Outliner did not send back an outline. Try again.");
  return addOutlineTree(manuscript.id, tree);
}
