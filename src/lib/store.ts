import {
  db,
  DEFAULT_FORMAT,
  newId,
  type Chapter,
  type ChapterKind,
  type ChapterStatus,
  type Id,
  type Manuscript,
  type OutlineItem,
  type OutlineKind,
  type Revision,
  type Workspace,
} from "@/db/schema";
import { sortChapters } from "./chapters";
import { childKind } from "./outline";
import { countWords } from "./text";

// ---------------------------------------------------------------------------
// Workspaces (pen names) and manuscripts
// ---------------------------------------------------------------------------

export async function createWorkspace(name: string): Promise<Workspace> {
  const now = Date.now();
  const workspace: Workspace = {
    id: newId(),
    name: name.trim() || "Untitled author",
    bio: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.workspaces.add(workspace);
  return workspace;
}

export async function patchWorkspace(id: Id, changes: Partial<Omit<Workspace, "id">>): Promise<void> {
  await db.workspaces.update(id, { ...changes, updatedAt: Date.now() });
}

export async function createManuscript(workspace: Workspace, title: string): Promise<Manuscript> {
  const now = Date.now();
  const manuscript: Manuscript = {
    id: newId(),
    workspaceId: workspace.id,
    title: title.trim() || "Untitled manuscript",
    subtitle: "",
    description: "",
    language: "en",
    isbn: "",
    keywords: [],
    copyright: `Copyright © ${new Date().getFullYear()} ${workspace.name}. All rights reserved.`,
    status: "outlining",
    targetWordCount: 0,
    format: { ...DEFAULT_FORMAT },
    createdAt: now,
    updatedAt: now,
  };
  await db.manuscripts.add(manuscript);
  return manuscript;
}

export async function patchManuscript(id: Id, changes: Partial<Omit<Manuscript, "id">>): Promise<void> {
  await db.manuscripts.update(id, { ...changes, updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export async function addOutlineItem(
  manuscriptId: Id,
  parentId: Id | null,
  kind?: OutlineKind,
): Promise<OutlineItem> {
  const all = await db.outlineItems.where("manuscriptId").equals(manuscriptId).toArray();
  const siblings = all.filter((item) => item.parentId === parentId);
  const parent = parentId ? all.find((item) => item.id === parentId) : undefined;
  const now = Date.now();
  const item: OutlineItem = {
    id: newId(),
    manuscriptId,
    parentId,
    kind: kind ?? childKind(parent ? parent.kind : null),
    title: "",
    summary: "",
    notes: "",
    order: siblings.length ? Math.max(...siblings.map((s) => s.order)) + 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.outlineItems.add(item);
  return item;
}

export async function patchOutlineItem(
  id: Id,
  changes: Partial<Pick<OutlineItem, "title" | "summary" | "notes" | "kind" | "chapterId">>,
): Promise<void> {
  await db.outlineItems.update(id, { ...changes, updatedAt: Date.now() });
}

function sortedSiblings(all: OutlineItem[], parentId: Id | null): OutlineItem[] {
  return all
    .filter((item) => item.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

/** Puts an item under `parentId` at position `index` and renumbers that group. */
async function placeItem(itemId: Id, parentId: Id | null, index: number): Promise<void> {
  await db.transaction("rw", db.outlineItems, async () => {
    const item = await db.outlineItems.get(itemId);
    if (!item) return;
    const all = await db.outlineItems.where("manuscriptId").equals(item.manuscriptId).toArray();
    const group = sortedSiblings(all, parentId).filter((other) => other.id !== itemId);
    group.splice(Math.max(0, Math.min(index, group.length)), 0, item);
    const now = Date.now();
    for (let i = 0; i < group.length; i++) {
      await db.outlineItems.update(group[i].id, {
        parentId,
        order: i,
        updatedAt: group[i].id === itemId ? now : group[i].updatedAt,
      });
    }
  });
}

export async function moveOutlineItem(
  itemId: Id,
  how: "up" | "down" | "indent" | "outdent",
): Promise<void> {
  const item = await db.outlineItems.get(itemId);
  if (!item) return;
  const all = await db.outlineItems.where("manuscriptId").equals(item.manuscriptId).toArray();
  const siblings = sortedSiblings(all, item.parentId);
  const index = siblings.findIndex((s) => s.id === itemId);

  if (how === "up" && index > 0) {
    await placeItem(itemId, item.parentId, index - 1);
  } else if (how === "down" && index < siblings.length - 1) {
    await placeItem(itemId, item.parentId, index + 1);
  } else if (how === "indent" && index > 0) {
    const previous = siblings[index - 1];
    await placeItem(itemId, previous.id, sortedSiblings(all, previous.id).length);
  } else if (how === "outdent" && item.parentId) {
    const parent = all.find((other) => other.id === item.parentId);
    if (!parent) return;
    const parentGroup = sortedSiblings(all, parent.parentId);
    const parentIndex = parentGroup.findIndex((s) => s.id === parent.id);
    await placeItem(itemId, parent.parentId, parentIndex + 1);
  }
}

const THREE_ACTS: { title: string; beats: string[] }[] = [
  { title: "Act I: Setup", beats: ["Opening image", "Inciting incident", "First plot point"] },
  { title: "Act II: Confrontation", beats: ["Rising action", "Midpoint", "Crisis"] },
  { title: "Act III: Resolution", beats: ["Climax", "Resolution"] },
];

/** Fills an empty outline with the classic three-act structure. */
export async function applyThreeActTemplate(manuscriptId: Id): Promise<void> {
  const now = Date.now();
  const items: OutlineItem[] = [];
  THREE_ACTS.forEach((act, actIndex) => {
    const actId = newId();
    items.push({
      id: actId,
      manuscriptId,
      parentId: null,
      kind: "act",
      title: act.title,
      summary: "",
      notes: "",
      order: actIndex,
      createdAt: now,
      updatedAt: now,
    });
    act.beats.forEach((beat, beatIndex) => {
      items.push({
        id: newId(),
        manuscriptId,
        parentId: actId,
        kind: "beat",
        title: beat,
        summary: "",
        notes: "",
        order: beatIndex,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  await db.outlineItems.bulkAdd(items);
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

export async function createChapter(
  manuscriptId: Id,
  kind: ChapterKind,
  title: string,
  content = "",
): Promise<Chapter> {
  const same = await db.chapters.where("manuscriptId").equals(manuscriptId).filter((c) => c.kind === kind).toArray();
  const now = Date.now();
  const chapter: Chapter = {
    id: newId(),
    manuscriptId,
    kind,
    title,
    content,
    wordCount: countWords(content),
    status: "draft",
    order: same.length ? Math.max(...same.map((c) => c.order)) + 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
  await db.chapters.add(chapter);
  return chapter;
}

export async function saveChapter(
  id: Id,
  changes: { title?: string; content?: string; status?: ChapterStatus },
): Promise<void> {
  const patch: Partial<Chapter> = { ...changes, updatedAt: Date.now() };
  if (changes.content !== undefined) patch.wordCount = countWords(changes.content);
  await db.chapters.update(id, patch);
}

export async function moveChapter(chapterId: Id, direction: "up" | "down"): Promise<void> {
  await db.transaction("rw", db.chapters, async () => {
    const chapter = await db.chapters.get(chapterId);
    if (!chapter) return;
    const all = await db.chapters.where("manuscriptId").equals(chapter.manuscriptId).toArray();
    const group = sortChapters(all.filter((c) => c.kind === chapter.kind));
    const index = group.findIndex((c) => c.id === chapterId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= group.length) return;
    [group[index], group[target]] = [group[target], group[index]];
    for (let i = 0; i < group.length; i++) {
      await db.chapters.update(group[i].id, { order: i });
    }
  });
}

/**
 * Gives an outline item its written chapter, creating the chapter on first use.
 * Returns the chapter id.
 */
export async function chapterForOutlineItem(item: OutlineItem): Promise<Id> {
  if (item.chapterId) {
    const existing = await db.chapters.get(item.chapterId);
    if (existing) return existing.id;
  }
  const chapter = await createChapter(item.manuscriptId, "chapter", item.title.trim() || "Untitled chapter");
  await patchOutlineItem(item.id, { chapterId: chapter.id });
  return chapter.id;
}

/** Creates a chapter for every outline chapter that has none yet. Returns how many were made. */
export async function chaptersFromOutline(items: OutlineItem[]): Promise<number> {
  let made = 0;
  for (const item of items) {
    if (item.kind !== "chapter") continue;
    const before = item.chapterId ? await db.chapters.get(item.chapterId) : undefined;
    if (before) continue;
    await chapterForOutlineItem(item);
    made++;
  }
  return made;
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export async function snapshotChapter(chapter: Chapter, label: string): Promise<Revision> {
  const revision: Revision = {
    id: newId(),
    chapterId: chapter.id,
    manuscriptId: chapter.manuscriptId,
    label,
    title: chapter.title,
    content: chapter.content,
    wordCount: chapter.wordCount,
    createdAt: Date.now(),
  };
  await db.revisions.add(revision);
  return revision;
}
