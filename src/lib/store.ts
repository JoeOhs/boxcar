import {
  db,
  DEFAULT_FORMAT,
  newId,
  type Chapter,
  type ChapterKind,
  type ChapterStatus,
  type Id,
  type Manuscript,
  type ManuscriptStatus,
  type ManuscriptType,
  type OutlineItem,
  type OutlineKind,
  type ResearchKind,
  type ResearchNote,
  type Revision,
  type Workspace,
} from "@/db/schema";
import { BOOK_TYPES, SCENE_LIST, THREE_ACTS } from "./bookTypes";
import { sortChapters } from "./chapters";
import { genreById, type Genre } from "./genres";
import { childKind, type OutlineNode } from "./outline";
import { seedRoadmap } from "./roadmap";
import { countWords } from "./text";

// ---------------------------------------------------------------------------
// Workspaces (pen names) and manuscripts
// ---------------------------------------------------------------------------

/**
 * Creates a workspace (an author or pen name). The name may be blank: a workspace
 * made with "Generate a pen name" gets its name in the new-manuscript menu.
 */
export async function createWorkspace(name: string): Promise<Workspace> {
  const now = Date.now();
  const workspace: Workspace = {
    id: newId(),
    name: name.trim(),
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

function defaultCopyright(penName: string): string {
  return `Copyright © ${new Date().getFullYear()} ${penName.trim() || "the author"}. All rights reserved.`;
}

/**
 * Creates a book in a workspace. With a genre from the genre guide the book starts
 * with that genre, its target length and its suggested keywords; `startOutline`
 * also fills the outline with the genre's structure. The type sets the default
 * length when there is no genre.
 */
export async function createManuscript(
  workspace: Workspace,
  title: string,
  genre?: Genre,
  startOutline = false,
  type: ManuscriptType = "novel",
): Promise<Manuscript> {
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
    copyright: defaultCopyright(workspace.name),
    status: "outlining",
    type,
    genre: genre?.id,
    targetWordCount: goalWordCount(genre, type),
    format: { ...DEFAULT_FORMAT },
    createdAt: now,
    updatedAt: now,
  };
  if (genre) manuscript.keywords = genre.keywords.slice(0, 7);
  await db.manuscripts.add(manuscript);
  if (genre && startOutline) await applyGenreStructure(manuscript.id, genre, type);
  await seedRoadmap(manuscript.id);
  return manuscript;
}

/**
 * Creates a series: a container row plus one book per volume (Book 1, Book 2 ...).
 * Each book gets the genre, length and (when asked) the genre's outline.
 * Returns the container and its books in order.
 */
export async function createSeries(
  workspace: Workspace,
  title: string,
  bookCount: number,
  genre?: Genre,
  startOutline = false,
): Promise<{ series: Manuscript; books: Manuscript[] }> {
  const now = Date.now();
  const cleanTitle = title.trim() || "Untitled series";
  const series: Manuscript = {
    id: newId(),
    workspaceId: workspace.id,
    title: cleanTitle,
    subtitle: "",
    description: "",
    language: "en",
    isbn: "",
    keywords: genre ? genre.keywords.slice(0, 7) : [],
    copyright: defaultCopyright(workspace.name),
    status: "outlining",
    type: "series",
    genre: genre?.id,
    targetWordCount: 0,
    format: { ...DEFAULT_FORMAT },
    createdAt: now,
    updatedAt: now,
  };
  await db.manuscripts.add(series);
  const books: Manuscript[] = [];
  const count = Math.max(1, Math.min(12, Math.floor(bookCount) || 1));
  for (let n = 1; n <= count; n++) {
    books.push(await addSeriesBook(series, n, cleanTitle, genre, startOutline));
  }
  return { series, books };
}

async function addSeriesBook(
  series: Manuscript,
  volumeNumber: number,
  seriesTitle: string,
  genre: Genre | undefined,
  startOutline: boolean,
): Promise<Manuscript> {
  const now = Date.now();
  const book: Manuscript = {
    id: newId(),
    workspaceId: series.workspaceId,
    title: `${seriesTitle}: Book ${volumeNumber}`,
    subtitle: "",
    description: "",
    language: series.language,
    isbn: "",
    keywords: series.keywords,
    copyright: series.copyright,
    status: "outlining",
    type: "novel",
    seriesId: series.id,
    volumeNumber,
    genre: series.genre,
    targetWordCount: genre?.targetWords ?? BOOK_TYPES.series.targetWords,
    format: { ...DEFAULT_FORMAT },
    createdAt: now,
    updatedAt: now,
  };
  await db.manuscripts.add(book);
  if (genre && startOutline) await applyGenreStructure(book.id, genre, "novel");
  await seedRoadmap(book.id);
  return book;
}

/** Adds the next book to a series, with the same genre and settings as the others. */
export async function addSeriesBookTo(seriesId: Id): Promise<Manuscript | undefined> {
  const series = await db.manuscripts.get(seriesId);
  if (!series || series.type !== "series") return undefined;
  const books = await db.manuscripts.where("seriesId").equals(seriesId).toArray();
  const next = books.length ? Math.max(...books.map((b) => b.volumeNumber ?? 0)) + 1 : 1;
  const genre = genreById(series.genre);
  return addSeriesBook(series, next, series.title, genre, false);
}

const STAGE_RANK: Record<ManuscriptStatus, number> = { outlining: 0, drafting: 1, editing: 2, formatting: 3, ready: 4 };

/**
 * The word-count goal a new book starts with: its genre's length, else the type's default.
 * Shown as a preview while the author picks a genre, and set once the book is created.
 */
export function goalWordCount(genre: Genre | undefined, type: ManuscriptType): number {
  return genre?.targetWords ?? BOOK_TYPES[type].targetWords;
}

/**
 * Changes a book. The inception of a book is locked once it is made: its type never
 * changes, a word-count goal never changes once set, the genre never changes once
 * chosen (a second genre can still be blended in), and the stage only moves forward.
 * Changes that break those rules are dropped here, whatever screen asked for them.
 */
export async function patchManuscript(id: Id, changes: Partial<Omit<Manuscript, "id">>): Promise<void> {
  const current = await db.manuscripts.get(id);
  if (!current) return;
  const next: Partial<Omit<Manuscript, "id">> = { ...changes };
  if (current.type && next.type !== undefined && next.type !== current.type) delete next.type;
  if (current.targetWordCount > 0 && next.targetWordCount !== undefined) delete next.targetWordCount;
  if (current.genre && next.genre !== undefined && next.genre !== current.genre) delete next.genre;
  if (next.status !== undefined && STAGE_RANK[next.status] < STAGE_RANK[current.status]) delete next.status;
  await db.manuscripts.update(id, { ...next, updatedAt: Date.now() });
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

/** Adds a set of top-level parts, each with its points as beats beneath it, after anything already in the outline. */
async function addOutlineParts(
  manuscriptId: Id,
  parts: { title: string; points: string[] }[],
  partKind: OutlineKind,
): Promise<void> {
  const existing = await db.outlineItems.where("manuscriptId").equals(manuscriptId).filter((i) => i.parentId === null).toArray();
  const firstOrder = existing.length ? Math.max(...existing.map((i) => i.order)) + 1 : 0;
  const now = Date.now();
  const items: OutlineItem[] = [];
  parts.forEach((part, partIndex) => {
    const partId = newId();
    items.push({
      id: partId,
      manuscriptId,
      parentId: null,
      kind: partKind,
      title: part.title,
      summary: "",
      notes: "",
      order: firstOrder + partIndex,
      createdAt: now,
      updatedAt: now,
    });
    part.points.forEach((point, pointIndex) => {
      items.push({
        id: newId(),
        manuscriptId,
        parentId: partId,
        kind: "beat",
        title: point,
        summary: "",
        notes: "",
        order: pointIndex,
        createdAt: now,
        updatedAt: now,
      });
    });
  });
  await db.outlineItems.bulkAdd(items);
}

/**
 * Adds a tree of outline nodes (from a framework or an imported file) after whatever
 * the outline already holds. Nothing existing is changed. Returns how many items were added.
 */
export async function addOutlineTree(manuscriptId: Id, nodes: OutlineNode[]): Promise<number> {
  const existing = await db.outlineItems.where("manuscriptId").equals(manuscriptId).toArray();
  const topLevel = existing.filter((item) => item.parentId === null);
  const firstOrder = topLevel.length ? Math.max(...topLevel.map((i) => i.order)) + 1 : 0;
  const now = Date.now();
  const items: OutlineItem[] = [];
  const walk = (list: OutlineNode[], parentId: Id | null, startOrder: number) => {
    list.forEach((node, index) => {
      const id = newId();
      items.push({
        id,
        manuscriptId,
        parentId,
        kind: node.kind,
        title: node.title,
        summary: node.summary,
        notes: "",
        order: startOrder + index,
        createdAt: now,
        updatedAt: now,
      });
      walk(node.children, id, 0);
    });
  };
  walk(nodes, null, firstOrder);
  await db.outlineItems.bulkAdd(items);
  return items.length;
}

/**
 * Fills an empty outline with the book type's starting structure: a scene list for
 * a short story, the three-act structure for everything else.
 */
export function applyStartTemplate(manuscriptId: Id, type: ManuscriptType): Promise<void> {
  if (type === "short-story") {
    return addOutlineParts(manuscriptId, SCENE_LIST.map((title) => ({ title, points: [] })), "scene");
  }
  return addOutlineParts(manuscriptId, THREE_ACTS, "act");
}

/**
 * Fills the outline with the structure from the genre guide: acts with beats for
 * fiction, chapters with key points for non-fiction (so "Create chapters from
 * outline" turns a non-fiction structure straight into chapters to write). A
 * short story gets the same sections as a flat list of scenes.
 */
export function applyGenreStructure(manuscriptId: Id, genre: Genre, type: ManuscriptType = "novel"): Promise<void> {
  const partKind: OutlineKind =
    type === "short-story" ? "scene" : genre.category === "fiction" ? "act" : "chapter";
  return addOutlineParts(manuscriptId, genre.structure, partKind);
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

/**
 * Creates a chapter for every outline item of the given kinds that has none yet
 * (chapters for a novel, scenes for a short story). Returns how many were made.
 */
export async function chaptersFromOutline(items: OutlineItem[], kinds: OutlineKind[] = ["chapter"]): Promise<number> {
  let made = 0;
  for (const item of items) {
    if (!kinds.includes(item.kind)) continue;
    const before = item.chapterId ? await db.chapters.get(item.chapterId) : undefined;
    if (before) continue;
    await chapterForOutlineItem(item);
    made++;
  }
  return made;
}

// ---------------------------------------------------------------------------
// Research repository
// ---------------------------------------------------------------------------

/** Adds a note, a link or an imported file's text to the book's research. It is shared with the Ghostwriter until the author turns that off. */
export async function createResearchNote(
  manuscriptId: Id,
  kind: ResearchKind,
  title: string,
  content = "",
  url = "",
): Promise<ResearchNote> {
  const now = Date.now();
  const note: ResearchNote = {
    id: newId(),
    manuscriptId,
    kind,
    title: title.trim() || "Untitled research",
    content,
    url: url.trim(),
    shareWithGhostwriter: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.researchNotes.add(note);
  return note;
}

export async function patchResearchNote(
  id: Id,
  changes: Partial<Pick<ResearchNote, "title" | "content" | "url" | "shareWithGhostwriter">>,
): Promise<void> {
  await db.researchNotes.update(id, { ...changes, updatedAt: Date.now() });
}

export async function deleteResearchNote(id: Id): Promise<void> {
  await db.researchNotes.delete(id);
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
