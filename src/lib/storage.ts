import { db, type Id } from "@/db/schema";

/**
 * How much space a book's history takes, and author-chosen ways to free it (F14).
 *
 * Revision snapshots, editor chat messages and cover concepts are kept forever by
 * default. Nothing here runs on its own: the Storage card in Settings shows the
 * numbers, and the author decides what to clear.
 */

export interface BookStorage {
  manuscriptId: Id;
  revisions: { count: number; bytes: number };
  messages: { count: number; bytes: number };
  covers: { count: number; bytes: number };
  totalBytes: number;
}

/** Revisions kept per chapter by "Keep only the latest". */
export const REVISIONS_TO_KEEP = 10;

/** Approximate stored size of a string (IndexedDB keeps text as UTF-16). */
const textBytes = (s: string) => s.length * 2;

export async function bookStorage(manuscriptId: Id): Promise<BookStorage> {
  const [revisions, messages, covers] = await Promise.all([
    db.revisions.where("manuscriptId").equals(manuscriptId).toArray(),
    db.agentMessages.where("manuscriptId").equals(manuscriptId).toArray(),
    db.coverConcepts.where("manuscriptId").equals(manuscriptId).toArray(),
  ]);
  const r = { count: revisions.length, bytes: revisions.reduce((n, x) => n + textBytes(x.content) + textBytes(x.title), 0) };
  const m = { count: messages.length, bytes: messages.reduce((n, x) => n + textBytes(x.text), 0) };
  const c = { count: covers.length, bytes: covers.reduce((n, x) => n + (x.image?.size ?? 0) + textBytes(x.prompt), 0) };
  return { manuscriptId, revisions: r, messages: m, covers: c, totalBytes: r.bytes + m.bytes + c.bytes };
}

/** What the browser says the whole app uses and may use, when it can tell. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return usage !== undefined && quota !== undefined ? { usage, quota } : null;
}

/** Deletes all but the newest `keep` revisions of each chapter in the book. Returns how many were deleted. */
export async function trimRevisions(manuscriptId: Id, keep = REVISIONS_TO_KEEP): Promise<number> {
  return db.transaction("rw", db.revisions, async () => {
    const all = await db.revisions.where("manuscriptId").equals(manuscriptId).toArray();
    const byChapter = new Map<Id, typeof all>();
    for (const r of all) byChapter.set(r.chapterId, [...(byChapter.get(r.chapterId) ?? []), r]);
    const doomed: Id[] = [];
    for (const list of byChapter.values()) {
      list.sort((a, b) => b.createdAt - a.createdAt);
      doomed.push(...list.slice(keep).map((r) => r.id));
    }
    await db.revisions.bulkDelete(doomed);
    return doomed.length;
  });
}

/** Deletes every AI conversation for the book (all roles). Returns how many messages were deleted. */
export async function clearBookChats(manuscriptId: Id): Promise<number> {
  return db.agentMessages.where("manuscriptId").equals(manuscriptId).delete();
}

/**
 * Deletes the book's cover concepts. The cover in use is a separate copy on the
 * manuscript, so it is kept. Returns how many concepts were deleted.
 */
export async function clearCoverConcepts(manuscriptId: Id): Promise<number> {
  return db.coverConcepts.where("manuscriptId").equals(manuscriptId).delete();
}

/** "1.4 MB", "820 KB", "0 KB". */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
