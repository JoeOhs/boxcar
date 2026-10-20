import { useLiveQuery } from "dexie-react-hooks";
import { db, newId, type Id, type StoryEntry, type StoryEntryKind } from "@/db/schema";

/**
 * Story info: the characters, locations and situations a book relies on, kept
 * beside its outline (the Outline screen's right-hand panel). The entries are
 * stored per book in storyEntries, and the outliner AI is given them as text.
 */

const LINE_BREAK = String.fromCharCode(10);

export const STORY_KINDS: StoryEntryKind[] = ["character", "location", "situation"];

export const STORY_KIND_LABEL: Record<StoryEntryKind, string> = {
  character: "Character",
  location: "Location",
  situation: "Situation",
};

export const STORY_KIND_PLURAL: Record<StoryEntryKind, string> = {
  character: "Characters",
  location: "Locations",
  situation: "Situations",
};

/** The story info of a book, oldest first. undefined while loading. */
export function useStoryEntries(manuscriptId: Id): StoryEntry[] | undefined {
  return useLiveQuery(() => db.storyEntries.where("manuscriptId").equals(manuscriptId).sortBy("createdAt"), [manuscriptId]);
}

export async function createStoryEntry(manuscriptId: Id, kind: StoryEntryKind): Promise<StoryEntry> {
  const now = Date.now();
  const entry: StoryEntry = {
    id: newId(),
    manuscriptId,
    kind,
    name: "",
    description: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.storyEntries.add(entry);
  return entry;
}

export async function patchStoryEntry(id: Id, changes: Partial<Pick<StoryEntry, "name" | "description" | "kind">>): Promise<void> {
  await db.storyEntries.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteStoryEntry(id: Id): Promise<void> {
  await db.storyEntries.delete(id);
}

/**
 * The story info as plain text for the AI: each kind with its entries, one line
 * per entry. Returns an empty string when there is none.
 */
export function storyInfoToText(entries: StoryEntry[]): string {
  const sections: string[] = [];
  for (const kind of STORY_KINDS) {
    const list = entries.filter((e) => e.kind === kind);
    if (list.length === 0) continue;
    const lines = list.map((e) => {
      const name = e.name.trim() || "Unnamed";
      const description = e.description.trim();
      return description ? "- " + name + ": " + description : "- " + name;
    });
    sections.push(STORY_KIND_PLURAL[kind] + ":" + LINE_BREAK + lines.join(LINE_BREAK));
  }
  return sections.join(LINE_BREAK + LINE_BREAK);
}
