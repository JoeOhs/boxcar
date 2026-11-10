import { describe, expect, it } from "vitest";
import { db } from "@/db/schema";
import { patchManuscript, createManuscript, createWorkspace, moveChapterTo, moveSceneToChapter, ensureScrapChapter } from "@/lib/store";
import { GENRES } from "@/lib/genres";
import { advanceStage, seedRoadmap, setRoadmapCardDone, stageFor } from "@/lib/roadmap";
import { completeStage, isStageOpen, manuscriptPhase, reopenStage, selectStage, workflowOf, modelForStage } from "@/lib/editing";
import { serializeScenes, newScene, parseScenes } from "@/lib/scenes";
import { bookChapters, sortChapters } from "@/lib/chapters";
import { chapter, seedBook } from "./helpers";

describe("inception lock (patchManuscript)", () => {
  async function locked() {
    const ws = await createWorkspace("P");
    const g = GENRES[0];
    const m = await createManuscript(ws, "T", g, false, "novel");
    return { m, g, other: GENRES.find((x) => x.id !== g.id)! };
  }
  it("type, targetWordCount, genre cannot change; blendGenre and title can", async () => {
    const { m, other } = await locked();
    await patchManuscript(m.id, { type: "short-story", targetWordCount: 1, genre: other.id, blendGenre: other.id, title: "New" });
    const after = (await db.manuscripts.get(m.id))!;
    expect([after.type, after.targetWordCount, after.genre, after.blendGenre, after.title]).toEqual([m.type, m.targetWordCount, m.genre, other.id, "New"]);
  });
  it("stage only moves forward", async () => {
    const { m } = await locked();
    await patchManuscript(m.id, { status: "editing" });
    await patchManuscript(m.id, { status: "drafting" });
    expect((await db.manuscripts.get(m.id))!.status).toBe("editing");
  });
  it.fails("BUG-lock-undefined: passing undefined explicitly must not clear locked fields", async () => {
    const { m } = await locked();
    await patchManuscript(m.id, { genre: undefined, type: undefined, status: undefined });
    const after = (await db.manuscripts.get(m.id))!;
    expect([after.genre, after.type, after.status]).toEqual([m.genre, m.type, m.status]);
  });
  it("a goal of 0 can still be set later (as documented)", async () => {
    const ws = await createWorkspace("P");
    const m = await createManuscript(ws, "T", undefined, false, "novel", 0);
    await patchManuscript(m.id, { targetWordCount: 50000 });
    expect((await db.manuscripts.get(m.id))!.targetWordCount).toBe(50000);
  });
});

describe("roadmap", () => {
  it("stageFor ignores optional cards and returns the first incomplete column", () => {
    expect(stageFor([])).toBeUndefined();
    expect(stageFor([{ column: "outlining", done: false, optional: true }, { column: "drafting", done: false }])).toBe("drafting");
    expect(stageFor([{ column: "drafting", done: true }, { column: "editing", done: false }])).toBe("editing");
    expect(stageFor([{ column: "ready", done: true }])).toBe("ready");
  });
  it("ticking required cards advances; unticking never regresses; seeding twice adds nothing", async () => {
    const { m } = await seedBook();
    await seedRoadmap(m.id);
    const cards = await db.roadmapCards.where("manuscriptId").equals(m.id).toArray();
    expect(cards).toHaveLength(16);
    for (const c of cards.filter((c) => c.column === "drafting")) await setRoadmapCardDone(c.id, true);
    expect((await db.manuscripts.get(m.id))!.status).toBe("editing");
    await setRoadmapCardDone(cards.find((c) => c.column === "drafting")!.id, false);
    await advanceStage(m.id);
    expect((await db.manuscripts.get(m.id))!.status).toBe("editing");
  });
  it("ticking only optional outline cards does not move the stage", async () => {
    const { m } = await seedBook();
    for (const c of await db.roadmapCards.where("manuscriptId").equals(m.id).toArray())
      if (c.column === "outlining") await setRoadmapCardDone(c.id, true);
    expect((await db.manuscripts.get(m.id))!.status).toBe("outlining");
  });
  it.fails("BUG-two-sources: finishing all four edit passes leaves the Roadmap stage at outlining", async () => {
    const { m } = await seedBook();
    for (const s of ["developmental", "line", "copy", "proofread"] as const) await completeStage((await db.manuscripts.get(m.id))!, s);
    const after = (await db.manuscripts.get(m.id))!;
    expect(manuscriptPhase(after)).toBe("finalized");
    expect(after.status).not.toBe("outlining");
  });
});

describe("editing workflow", () => {
  it("phases: Draft -> Revision -> Finalized; reopening drops later passes", async () => {
    const { m } = await seedBook();
    const get = async () => (await db.manuscripts.get(m.id))!;
    expect(manuscriptPhase(await get())).toBe("draft");
    await completeStage(await get(), "developmental");
    expect(manuscriptPhase(await get())).toBe("revision");
    await completeStage(await get(), "line");
    await completeStage(await get(), "copy");
    expect(manuscriptPhase(await get())).toBe("revision");
    await completeStage(await get(), "proofread");
    expect(manuscriptPhase(await get())).toBe("finalized");
    await reopenStage(await get(), "line");
    expect((await get()).editWorkflow!.completed).toEqual(["developmental"]);
  });
  it("a pass cannot open or complete before earlier ones finish", async () => {
    const { m } = await seedBook();
    const get = async () => (await db.manuscripts.get(m.id))!;
    await completeStage(await get(), "copy");
    await selectStage(await get(), "proofread");
    expect(workflowOf(await get())).toMatchObject({ stage: "developmental", completed: [] });
    expect(isStageOpen({ stage: "developmental", completed: [], styleGuide: "" }, "line")).toBe(false);
    expect(workflowOf({ ...(await get()), editWorkflow: { stage: "proofread", completed: [], styleGuide: "" } }).stage).toBe("developmental");
  });
  it("modelForStage: author choice > per-stage default > key model > provider default", () => {
    expect(modelForStage("openai", { openai: { line: "mine" } }, "line")).toBe("mine");
    expect(modelForStage("anthropic", {}, "proofread")).toBe("claude-haiku-5-5");
    expect(modelForStage("ollama", {}, "copy", "keymodel")).toBe("keymodel");
    expect(modelForStage("ollama", {}, "copy")).toBe("llama3.2");
  });
});

describe("chapters and scenes", () => {
  it("bookChapters excludes scrap; sortChapters puts front first and back last", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>b</p>", "back", "Back");
    await chapter(m, "<p>c</p>", "chapter", "C1");
    await chapter(m, "<p>s</p>", "scrap", "Scrap");
    await chapter(m, "<p>f</p>", "front", "Front");
    expect(sortChapters(bookChapters(await db.chapters.toArray())).map((c) => c.title)).toEqual(["Front", "C1", "Back"]);
  });
  it("moveChapterTo reorders and moves across sections", async () => {
    const { m } = await seedBook();
    const a = await chapter(m, "", "chapter", "A");
    const b = await chapter(m, "", "chapter", "B");
    await moveChapterTo(b.id, "chapter", a.id);
    expect(sortChapters(await db.chapters.toArray()).map((c) => c.title)).toEqual(["B", "A"]);
    await moveChapterTo(a.id, "front", null);
    expect((await db.chapters.get(a.id))!.kind).toBe("front");
  });
  it("moveSceneToChapter moves a scene into the scrap bin without duplicating", async () => {
    const { m } = await seedBook();
    const s1 = newScene("<p>keep</p>", "One");
    const s2 = newScene("<p>move me</p>", "Two");
    const from = await chapter(m, serializeScenes([s1, s2]));
    const scrap = await ensureScrapChapter(m.id);
    await moveSceneToChapter(from.id, s2.id, scrap.id);
    expect(parseScenes((await db.chapters.get(from.id))!.content).map((s) => s.id)).toEqual([s1.id]);
    expect(parseScenes((await db.chapters.get(scrap.id))!.content).map((s) => s.id)).toEqual([s2.id]);
    expect((await ensureScrapChapter(m.id)).id).toBe(scrap.id);
  });
});
