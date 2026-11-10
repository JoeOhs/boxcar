import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import {
  BoxcarDB, db, deleteChapter, deleteManuscript, deleteOutlineItem, deleteWorkspace, newId,
} from "@/db/schema";
import { addOutlineItem, createSeries, createWorkspace, patchOutlineItem, snapshotChapter } from "@/lib/store";
import { createUniverseNode } from "@/lib/universe";
import { createTranslation } from "@/lib/translate";
import { chapter, counts, seedBook } from "./helpers";

const V1 = {
  workspaces: "id, name, updatedAt",
  manuscripts: "id, workspaceId, status, updatedAt",
  outlineItems: "id, manuscriptId, parentId, chapterId, [manuscriptId+order]",
  chapters: "id, manuscriptId, [manuscriptId+order]",
  revisions: "id, chapterId, manuscriptId, createdAt",
  suggestions: "id, chapterId, manuscriptId, status",
  agentMessages: "id, manuscriptId, role, createdAt",
  settings: "key",
};

describe("migrations", () => {
  it("opens a v1 database at the latest version without losing rows", async () => {
    const name = "mig-v1-" + newId();
    const old = new Dexie(name);
    old.version(1).stores(V1);
    await old.open();
    await old.table("workspaces").add({ id: "w", name: "P", bio: "", createdAt: 1, updatedAt: 1 });
    await old.table("manuscripts").add({ id: "m", workspaceId: "w", title: "T", status: "drafting", targetWordCount: 0, keywords: [], format: {}, createdAt: 1, updatedAt: 1 });
    await old.table("chapters").add({ id: "c", manuscriptId: "m", kind: "chapter", title: "C", content: "<p>hi</p>", wordCount: 1, status: "draft", order: 0, createdAt: 1, updatedAt: 1 });
    await old.table("settings").add({ key: "ai", value: { provider: "openai", apiKey: "sk-legacy", model: "x" } });
    old.close();

    const fresh = new BoxcarDB(name);
    await fresh.open();
    expect(fresh.verno).toBe(7);
    expect(await fresh.workspaces.count()).toBe(1);
    expect((await fresh.manuscripts.get("m"))?.title).toBe("T");
    expect((await fresh.chapters.get("c"))?.content).toBe("<p>hi</p>");
    expect(await fresh.universeNodes.count()).toBe(0);
    fresh.close();
  });

  it("v7 upgrade moves storyEntries into universeNodes", async () => {
    const name = "mig-v6-" + newId();
    const old = new Dexie(name);
    old.version(6).stores({
      ...V1,
      manuscripts: "id, workspaceId, status, updatedAt, seriesId, translationOf",
      coverConcepts: "id, manuscriptId, createdAt",
      apiKeys: "id, kind, status, createdAt",
      roadmapCards: "id, manuscriptId, column, [manuscriptId+column]",
      researchNotes: "id, manuscriptId, updatedAt",
      storyEntries: "id, manuscriptId, kind, updatedAt",
    });
    await old.open();
    await old.table("storyEntries").bulkAdd([
      { id: "s1", manuscriptId: "m", kind: "character", name: "Ana", description: "hero", createdAt: 1, updatedAt: 2 },
      { id: "s2", manuscriptId: "m", kind: "weird", name: "X", description: "?", createdAt: 1, updatedAt: 2 },
    ]);
    old.close();

    const fresh = new BoxcarDB(name);
    await fresh.open();
    const nodes = await fresh.universeNodes.orderBy("id").toArray();
    expect(nodes.map((n) => [n.id, n.kind, n.name, n.summary])).toEqual([
      ["s1", "character", "Ana", "hero"],
      ["s2", "concept", "X", "?"],
    ]);
    // The old rows are kept (not deleted) — harmless, but they are now dead data.
    expect(await fresh.storyEntries.count()).toBe(2);
    fresh.close();
  });
});

async function fullBook() {
  const { ws, m } = await seedBook();
  const c = await chapter(m, "<p>one two</p>");
  await snapshotChapter(c, "snap");
  await db.suggestions.add({ id: newId(), chapterId: c.id, manuscriptId: m.id, source: "user", original: "one", replacement: "1", comment: "", status: "pending", createdAt: 1 });
  await db.agentMessages.add({ id: newId(), manuscriptId: m.id, role: "ghostwriter", from: "user", text: "hi", createdAt: 1 });
  await db.coverConcepts.add({ id: newId(), manuscriptId: m.id, prompt: "p", provider: "openai", model: "x", image: new Blob(["img"]), createdAt: 1 });
  await db.researchNotes.add({ id: newId(), manuscriptId: m.id, kind: "note", title: "r", content: "", url: "", shareWithGhostwriter: true, createdAt: 1, updatedAt: 1 });
  await db.storyEntries.add({ id: newId(), manuscriptId: m.id, kind: "character", name: "a", description: "", createdAt: 1, updatedAt: 1 });
  await createUniverseNode(m.id, "character");
  const item = await addOutlineItem(m.id, null);
  await patchOutlineItem(item.id, { chapterId: c.id });
  await createTranslation(m, { code: "es", name: "Spanish" });
  return { ws, m, c, item };
}

describe("cascade deletes", () => {
  it("deleteManuscript removes every child table, including translations", async () => {
    const { m, ws } = await fullBook();
    await deleteManuscript(m.id);
    const c = await counts();
    for (const t of ["manuscripts", "chapters", "revisions", "suggestions", "agentMessages", "coverConcepts", "roadmapCards", "researchNotes", "storyEntries", "universeNodes", "outlineItems"]) {
      expect([t, c[t]]).toEqual([t, 0]);
    }
    expect(await db.workspaces.get(ws.id)).toBeDefined();
  });

  it("deleteWorkspace removes series books and everything under them", async () => {
    const ws = await createWorkspace("S");
    const { books } = await createSeries(ws, "Saga", 3);
    await chapter(books[1], "<p>x</p>");
    await deleteWorkspace(ws.id);
    const c = await counts();
    expect(c.manuscripts + c.chapters + c.roadmapCards + c.workspaces).toBe(0);
  });

  it.fails("BUG-dangling-settings: deleteWorkspace leaves no dangling active-workspace/manuscript setting", async () => {
    const { ws, m } = await seedBook();
    await db.settings.bulkPut([{ key: "activeWorkspaceId", value: ws.id }, { key: "activeManuscriptId", value: m.id }]);
    await deleteWorkspace(ws.id);
    const left = (await db.settings.toArray()).filter((s) => s.value === ws.id || s.value === m.id);
    // FINDING: the settings still point at deleted rows.
    expect(left.map((s) => s.key)).toEqual([]);
  });

  it("deleteChapter removes revisions + suggestions and unlinks outline", async () => {
    const { c, item } = await fullBook();
    await deleteChapter(c.id);
    expect(await db.revisions.where("chapterId").equals(c.id).count()).toBe(0);
    expect(await db.suggestions.where("chapterId").equals(c.id).count()).toBe(0);
    expect((await db.outlineItems.get(item.id))?.chapterId).toBeUndefined();
  });

  it.fails("BUG-orphan-translation: deleteChapter leaves no translated chapter pointing at a missing source", async () => {
    const { c } = await fullBook();
    await deleteChapter(c.id);
    const dangling = await db.chapters.filter((x) => x.sourceChapterId === c.id).count();
    // FINDING: translation chapter keeps sourceChapterId of a deleted chapter.
    expect(dangling).toBe(0);
  });

  it("deleteOutlineItem removes descendants only", async () => {
    const { m } = await seedBook();
    const a = await addOutlineItem(m.id, null);
    const b = await addOutlineItem(m.id, a.id);
    await addOutlineItem(m.id, b.id);
    const keep = await addOutlineItem(m.id, null);
    await deleteOutlineItem(a.id);
    expect((await db.outlineItems.toArray()).map((i) => i.id)).toEqual([keep.id]);
  });

  it("deleteUniverseNode removes the id from other nodes' links", async () => {
    const { m } = await seedBook();
    const { patchUniverseNode, deleteUniverseNode } = await import("@/lib/universe");
    const a = await createUniverseNode(m.id, "character");
    const b = await createUniverseNode(m.id, "location");
    await patchUniverseNode(a.id, { links: [b.id] });
    await deleteUniverseNode(b.id);
    expect((await db.universeNodes.get(a.id))?.links).toEqual([]);
  });
});
