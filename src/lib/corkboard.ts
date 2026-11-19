import { useLiveQuery } from "dexie-react-hooks";
import { db, newId, type AgentRole, type CorkNote, type CorkNoteColor, type Id } from "@/db/schema";
import { createUniverseNode, patchUniverseNode } from "@/lib/universe";

/** Note paper colours, in the order the colour button cycles through them. */
export const CORK_NOTE_COLORS: CorkNoteColor[] = ["yellow", "pink", "blue", "green"];

/** Size of a note on the board, in pixels. Used to place new notes and to keep them on the board. */
export const CORK_NOTE_WIDTH = 220;
export const CORK_NOTE_HEIGHT = 180;

/** The notes on a book's Cork board, oldest first (so a newer note lies on top). undefined while loading. */
export function useCorkNotes(manuscriptId: Id): CorkNote[] | undefined {
  return useLiveQuery(() => db.corkNotes.where("manuscriptId").equals(manuscriptId).sortBy("createdAt"), [manuscriptId]);
}

/**
 * Where the next note lands: in rows across the board, slightly askew so a fresh stack
 * still looks pinned by hand. The author drags it anywhere afterwards.
 */
export function nextNotePosition(count: number): { x: number; y: number } {
  const perRow = 4;
  const col = count % perRow;
  const row = Math.floor(count / perRow) % 6;
  return { x: 24 + col * (CORK_NOTE_WIDTH + 24) + (row % 2) * 12, y: 24 + row * (CORK_NOTE_HEIGHT + 24) };
}

/** Pins a note to the board. With `fromRole`, the note is an AI reply sent from a chat bubble. */
export async function createCorkNote(manuscriptId: Id, text: string, fromRole?: AgentRole): Promise<CorkNote> {
  const count = await db.corkNotes.where("manuscriptId").equals(manuscriptId).count();
  const now = Date.now();
  const note: CorkNote = {
    id: newId(),
    manuscriptId,
    text,
    fromRole,
    color: fromRole ? "yellow" : CORK_NOTE_COLORS[count % CORK_NOTE_COLORS.length],
    ...nextNotePosition(count),
    createdAt: now,
    updatedAt: now,
  };
  await db.corkNotes.add(note);
  return note;
}

export async function patchCorkNote(id: Id, changes: Partial<Pick<CorkNote, "text" | "color" | "x" | "y">>): Promise<void> {
  await db.corkNotes.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteCorkNote(id: Id): Promise<void> {
  await db.corkNotes.delete(id);
}

/**
 * Turns a note into a Universe concept node: the first line becomes the name, the whole
 * note the summary. The note stays on the board; returns the new node's id.
 */
export async function corkNoteToUniverseNode(note: CorkNote): Promise<Id> {
  const firstLine = note.text.trim().split("\n")[0].replace(/[*#>_`]/g, "").trim();
  const name = firstLine.length > 60 ? firstLine.slice(0, 57).trimEnd() + "..." : firstLine;
  const node = await createUniverseNode(note.manuscriptId, "concept");
  await patchUniverseNode(node.id, { name, summary: note.text.trim() });
  return node.id;
}
