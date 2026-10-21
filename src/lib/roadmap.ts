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

/** The outline cards are optional: an author may write without an outline and skip them. */
const FIRST_CARDS: { column: ManuscriptStatus; title: string; screen?: CardScreen; optional?: boolean }[] = [
  { column: "outlining", title: "Choose a genre and a structure to follow", screen: "outline", optional: true },
  { column: "outlining", title: "Build the outline: acts, chapters, scenes", screen: "outline", optional: true },
  { column: "outlining", title: "Create the chapters from the outline", screen: "outline", optional: true },
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
    if (!manuscript) return;
    if (manuscript.roadmapSeeded) {
      // Outline cards made before they could be optional are made optional now.
      const older = await db.roadmapCards
        .where("manuscriptId")
        .equals(manuscriptId)
        .filter((c) => c.column === "outlining" && c.screen === "outline" && c.optional === undefined)
        .toArray();
      for (const card of older) await db.roadmapCards.update(card.id, { optional: true });
      return;
    }
    const now = Date.now();
    const perColumn = new Map<ManuscriptStatus, number>();
    const cards: RoadmapCard[] = FIRST_CARDS.map((card) => {
      const order = perColumn.get(card.column) ?? 0;
      perColumn.set(card.column, order + 1);
      return {
        id: newId(),
        manuscriptId,
        column: card.column,
        title: card.title,
        screen: card.screen,
        optional: card.optional ?? false,
        done: false,
        order,
        createdAt: now,
      };
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

/**
 * The stage a book is in, from its ticked steps: the first column that still has a
 * required step not ticked, or "ready" when every required step is ticked. Returns
 * undefined when there are no required steps to go by.
 */
export function stageFor(cards: Pick<RoadmapCard, "column" | "done" | "optional">[]): ManuscriptStatus | undefined {
  const required = cards.filter((c) => !c.optional);
  if (required.length === 0) return undefined;
  for (const column of ROADMAP_COLUMNS) {
    if (required.some((c) => c.column === column.id && !c.done)) return column.id;
  }
  return "ready";
}

/**
 * Moves the book's stage forward to match its ticked steps. The stage never moves
 * back: once a stage is reached it stays, even if a step is unticked.
 */
export async function advanceStage(manuscriptId: Id): Promise<void> {
  const [cards, manuscript] = await Promise.all([
    db.roadmapCards.where("manuscriptId").equals(manuscriptId).toArray(),
    db.manuscripts.get(manuscriptId),
  ]);
  if (!manuscript) return;
  const derived = stageFor(cards);
  if (!derived) return;
  const rank = (status: ManuscriptStatus) => ROADMAP_COLUMNS.findIndex((c) => c.id === status);
  if (rank(derived) > rank(manuscript.status)) {
    await db.manuscripts.update(manuscriptId, { status: derived, updatedAt: Date.now() });
  }
}

/** Ticks or unticks a step. A required step that is ticked may move the book on to its next stage. */
export async function setRoadmapCardDone(id: Id, done: boolean): Promise<void> {
  const card = await db.roadmapCards.get(id);
  if (!card) return;
  await db.roadmapCards.update(id, { done });
  if (!card.optional && done) await advanceStage(card.manuscriptId);
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
