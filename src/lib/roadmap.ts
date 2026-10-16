import { db, newId, type Id, type ManuscriptStatus, type RoadmapCard } from "@/db/schema";

/** The Roadmap's columns: the stages a manuscript passes through, from outline to publish. */
export const ROADMAP_COLUMNS: { id: ManuscriptStatus; label: string; blurb: string }[] = [
  { id: "outlining", label: "Outline", blurb: "Build the bones of the book." },
  { id: "drafting", label: "Write", blurb: "Get the story or argument onto the page." },
  { id: "editing", label: "Edit", blurb: "Four passes, from structure to typos." },
  { id: "formatting", label: "Format", blurb: "Make the pages look right." },
  { id: "ready", label: "Publish", blurb: "Export and send it to the world." },
];

type CardScreen = NonNullable<RoadmapCard["screen"]>;

const FIRST_CARDS: { column: ManuscriptStatus; title: string; screen?: CardScreen }[] = [
  { column: "outlining", title: "Choose a genre and a structure to follow", screen: "outline" },
  { column: "outlining", title: "Build the outline: acts, chapters, scenes", screen: "outline" },
  { column: "outlining", title: "Create the chapters from the outline", screen: "outline" },
  { column: "drafting", title: "Write the first draft", screen: "write" },
  { column: "drafting", title: "Gather research for the book", screen: "write" },
  { column: "drafting", title: "Reach the target word count", screen: "write" },
  { column: "editing", title: "Developmental edit: the big picture", screen: "edit" },
  { column: "editing", title: "Line edit: the prose", screen: "edit" },
  { column: "editing", title: "Copy edit: grammar and consistency", screen: "edit" },
  { column: "editing", title: "Proofread: the final check", screen: "edit" },
  { column: "formatting", title: "Choose how the book looks", screen: "format" },
  { column: "formatting", title: "Check the preview page by page", screen: "format" },
  { column: "formatting", title: "Design the cover", screen: "cover" },
  { column: "ready", title: "Fill in the book details for Amazon KDP", screen: "export" },
  { column: "ready", title: "Export the book", screen: "export" },
  { column: "ready", title: "Upload it to Amazon KDP" },
];

/** Gives a manuscript its first Roadmap cards, once. Safe to call again: it does nothing the second time. */
export function seedRoadmap(manuscriptId: Id): Promise<void> {
  return db.transaction("rw", db.manuscripts, db.roadmapCards, async () => {
    const manuscript = await db.manuscripts.get(manuscriptId);
    if (!manuscript || manuscript.roadmapSeeded) return;
    const now = Date.now();
    const perColumn = new Map<ManuscriptStatus, number>();
    const cards: RoadmapCard[] = FIRST_CARDS.map((card) => {
      const order = perColumn.get(card.column) ?? 0;
      perColumn.set(card.column, order + 1);
      return { id: newId(), manuscriptId, column: card.column, title: card.title, screen: card.screen, done: false, order, createdAt: now };
    });
    await db.roadmapCards.bulkAdd(cards);
    await db.manuscripts.update(manuscriptId, { roadmapSeeded: true });
  });
}

export async function addRoadmapCard(manuscriptId: Id, column: ManuscriptStatus, title: string): Promise<void> {
  const text = title.trim();
  if (!text) return;
  const same = await db.roadmapCards.where("[manuscriptId+column]").equals([manuscriptId, column]).toArray();
  await db.roadmapCards.add({
    id: newId(),
    manuscriptId,
    column,
    title: text,
    done: false,
    order: same.length ? Math.max(...same.map((c) => c.order)) + 1 : 0,
    createdAt: Date.now(),
  });
}

export async function setRoadmapCardDone(id: Id, done: boolean): Promise<void> {
  await db.roadmapCards.update(id, { done });
}

export async function deleteRoadmapCard(id: Id): Promise<void> {
  await db.roadmapCards.delete(id);
}

/** Puts a card in a column, just before another card, or at the end when `beforeId` is null. */
export function moveRoadmapCard(cardId: Id, column: ManuscriptStatus, beforeId: Id | null): Promise<void> {
  return db.transaction("rw", db.roadmapCards, async () => {
    const card = await db.roadmapCards.get(cardId);
    if (!card) return;
    const inColumn = (await db.roadmapCards.where("[manuscriptId+column]").equals([card.manuscriptId, column]).toArray())
      .filter((c) => c.id !== cardId)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
    const at = beforeId ? inColumn.findIndex((c) => c.id === beforeId) : -1;
    inColumn.splice(at === -1 ? inColumn.length : at, 0, { ...card, column });
    await Promise.all(inColumn.map((c, order) => db.roadmapCards.update(c.id, { column, order })));
  });
}
