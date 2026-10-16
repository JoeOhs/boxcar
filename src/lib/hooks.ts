import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Chapter, type Id, type OutlineItem, type ResearchNote } from "@/db/schema";
import { sortChapters } from "./chapters";

/** The research repository of a manuscript, oldest first. undefined while loading. */
export function useResearchNotes(manuscriptId: Id): ResearchNote[] | undefined {
  return useLiveQuery(() => db.researchNotes.where("manuscriptId").equals(manuscriptId).sortBy("createdAt"), [manuscriptId]);
}

/** Chapters of a manuscript in book order. undefined while loading. */
export function useChapters(manuscriptId: Id): Chapter[] | undefined {
  return useLiveQuery(
    async () => sortChapters(await db.chapters.where("manuscriptId").equals(manuscriptId).toArray()),
    [manuscriptId],
  );
}

/** Outline items of a manuscript. undefined while loading. */
export function useOutlineItems(manuscriptId: Id): OutlineItem[] | undefined {
  return useLiveQuery(() => db.outlineItems.where("manuscriptId").equals(manuscriptId).toArray(), [manuscriptId]);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
