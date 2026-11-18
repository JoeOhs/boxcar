import { db, type Id } from "@/db/schema";
import { saveChapter } from "./store";

/**
 * A safety copy of unsaved typing, for when the window closes or reloads.
 *
 * The Write screen saves to IndexedDB 600 ms after the last keystroke. If the page is
 * closed inside that window, the save it starts is asynchronous and the browser does
 * not wait for it, so the last words could be lost. localStorage writes synchronously,
 * so the page keeps a copy there as it closes; the next start puts the copy back if the
 * database never received it, then removes it.
 */

const PREFIX = "boxcar.unsaved:";

interface RecoveryCopy {
  title: string;
  content: string;
  /** When the copy was made; it is only applied if the chapter was not saved after this. */
  at: number;
}

/** Keeps a synchronous copy of a chapter's unsaved title and text. Never throws. */
export function saveRecoveryCopy(chapterId: Id, title: string, content: string): void {
  try {
    const copy: RecoveryCopy = { title, content, at: Date.now() };
    localStorage.setItem(PREFIX + chapterId, JSON.stringify(copy));
  } catch {
    // Storage full or unavailable: the normal save is still attempted.
  }
}

/** Drops the copy once the chapter is safely in the database. Never throws. */
export function clearRecoveryCopy(chapterId: Id): void {
  try {
    localStorage.removeItem(PREFIX + chapterId);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Puts back any copy whose chapter was not saved after the copy was made, and removes
 * every copy. Runs once at start-up, before the Write screen reads a chapter.
 * Returns how many chapters were restored.
 */
export async function recoverUnsavedDrafts(): Promise<number> {
  let keys: string[];
  try {
    keys = Object.keys(localStorage).filter((key) => key.startsWith(PREFIX));
  } catch {
    return 0;
  }
  let restored = 0;
  for (const key of keys) {
    const chapterId = key.slice(PREFIX.length);
    try {
      const copy = JSON.parse(localStorage.getItem(key) ?? "null") as RecoveryCopy | null;
      const chapter = await db.chapters.get(chapterId);
      if (copy && chapter && copy.at > chapter.updatedAt && (copy.content !== chapter.content || copy.title !== chapter.title)) {
        await saveChapter(chapterId, { title: copy.title, content: copy.content });
        restored++;
      }
    } catch {
      // A damaged copy is dropped; the database keeps what it has.
    }
    clearRecoveryCopy(chapterId);
  }
  return restored;
}
