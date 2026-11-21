import { describe, expect, it } from "vitest";
import { db, type AiSettings } from "@/db/schema";
import { CHAPTER_PART_CHARACTERS, requestStageReview } from "@/lib/ai";
import { SUMMARY_BRIEF_FICTION, SUMMARY_BRIEF_NONFICTION } from "@/lib/chapterSummary";
import { DEVELOPMENTAL_AGENTS, runDevelopmentalReview, type DevelopmentalProgress } from "@/lib/developmentalReview";
import { saveChapter } from "@/lib/store";
import { chapter, mockFetch, openAiReply, seedBook, type Call } from "./helpers";

// F28: the developmental editors read an AI summary of every chapter (made from its
// full text); the line, copy and proofreading passes read every word.

const S: AiSettings = { provider: "openai", apiKey: "test-key-0000", model: "m-1" };

/** The user prompt of an OpenAI-style call. */
const promptOf = (c: Call): string => c.body.messages[c.body.messages.length - 1].content;
const isSummaryCall = (c: Call) => promptOf(c).startsWith("Summarise this chapter");

/** Answers summary requests with "SUMMARY OF <chapter title>" and editor requests with no notes. */
function fakeAi() {
  return mockFetch((call) => {
    const title = /CHAPTER "([^"]*)"/.exec(promptOf(call))?.[1];
    return openAiReply(isSummaryCall(call) ? `SUMMARY OF ${title}` : "[]");
  });
}

const filler = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

describe("developmental pass (F28)", () => {
  it("summarises every word of each chapter and gives the editors those summaries", async () => {
    const { m } = await seedBook();
    await chapter(m, `<p>${filler(400)} LATE-PLOT-TWIST</p>`, "chapter", "Alpha");
    await chapter(m, "<p>Short one.</p>", "chapter", "Beta");
    const calls = fakeAi();

    await runDevelopmentalReview(m, S);

    const summaries = calls.filter(isSummaryCall);
    expect(summaries).toHaveLength(2);
    // The summariser saw the end of the chapter, which the old 240-character excerpt never reached.
    expect(summaries.some((c) => promptOf(c).includes("LATE-PLOT-TWIST"))).toBe(true);

    const editors = calls.filter((c) => !isSummaryCall(c));
    expect(editors).toHaveLength(4);
    for (const call of editors) {
      expect(promptOf(call)).toContain("SUMMARY OF Alpha");
      expect(promptOf(call)).toContain("SUMMARY OF Beta");
    }
  });

  it("reuses saved summaries and only re-summarises chapters whose text changed", async () => {
    const { m } = await seedBook();
    const a = await chapter(m, "<p>First chapter.</p>", "chapter", "Alpha");
    await chapter(m, "<p>Second chapter.</p>", "chapter", "Beta");

    fakeAi();
    await runDevelopmentalReview(m, S);
    expect((await db.chapters.get(a.id))!.devSummary?.text).toBe("SUMMARY OF Alpha");

    let calls = fakeAi();
    await runDevelopmentalReview(m, S);
    expect(calls.filter(isSummaryCall)).toHaveLength(0);

    await saveChapter(a.id, { content: "<p>First chapter, rewritten.</p>" });
    calls = fakeAi();
    await runDevelopmentalReview(m, S);
    const redone = calls.filter(isSummaryCall);
    expect(redone).toHaveLength(1);
    expect(promptOf(redone[0])).toContain("rewritten");
  });

  it("summarises a chapter longer than one request in parts, so nothing is left unread", async () => {
    const { m } = await seedBook();
    const long = `<p>${filler(2500)}</p><p>${filler(2500)}</p><p>${filler(2500)} THE-LAST-LINE</p>`;
    await chapter(m, long, "chapter", "Epic");
    const calls = fakeAi();

    await runDevelopmentalReview(m, S);

    const parts = calls.filter(isSummaryCall);
    expect(parts.length).toBeGreaterThan(1);
    expect(promptOf(parts[parts.length - 1])).toContain("THE-LAST-LINE");
  });

  it.each([
    ["fantasy", SUMMARY_BRIEF_FICTION],
    ["memoir", SUMMARY_BRIEF_NONFICTION],
    [undefined, SUMMARY_BRIEF_FICTION],
  ])("a book in genre %s is summarised with the matching brief", async (genre, brief) => {
    const { m } = await seedBook();
    await db.manuscripts.update(m.id, { genre });
    await chapter(m, "<p>Text.</p>", "chapter", "Alpha");
    const calls = fakeAi();

    await runDevelopmentalReview((await db.manuscripts.get(m.id))!, S);

    const summary = calls.find(isSummaryCall)!;
    expect(promptOf(summary).startsWith(brief)).toBe(true);
  });

  it("keeps summaries already written when a later request fails", async () => {
    const { m } = await seedBook();
    const a = await chapter(m, "<p>One.</p>", "chapter", "Alpha");
    await chapter(m, "<p>Two.</p>", "chapter", "Beta");
    mockFetch(openAiReply("SUMMARY OF Alpha"), new TypeError("Failed to fetch"));

    await expect(runDevelopmentalReview(m, S)).rejects.toThrow();
    expect((await db.chapters.get(a.id))!.devSummary?.text).toBe("SUMMARY OF Alpha");
    expect(await db.suggestions.count()).toBe(0);
  });
});

describe("line, copy and proofreading passes read every word", () => {
  it.each(["line", "copy", "proofread"] as const)("%s pass sends the whole of a long chapter", async (stage) => {
    const text = `${"x".repeat(CHAPTER_PART_CHARACTERS - 10)}\n${filler(3000)} FINAL-SENTENCE`;
    const calls = mockFetch(openAiReply("[]"));

    await requestStageReview(S, stage, text, "", "");

    const sent = calls.map(promptOf).join("\n");
    expect(calls.length).toBeGreaterThan(1);
    expect(sent).toContain("FINAL-SENTENCE");
    expect(sent).toContain("word2999");
  });
});

describe("developmental progress bar", () => {
  it("reports steadily rising progress with a couple of words for each step", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>One.</p>", "chapter", "Alpha");
    await chapter(m, "<p>Two.</p>", "chapter", "Beta");
    fakeAi();
    const seen: DevelopmentalProgress[] = [];

    await runDevelopmentalReview(m, S, (p) => seen.push(p));

    // Two chapter summaries, then the four editors.
    expect(seen.map((p) => p.label)).toEqual([
      "Reading chapter 1 of 2",
      "Reading chapter 2 of 2",
      ...DEVELOPMENTAL_AGENTS.map((a) => a.thinking),
    ]);
    const fractions = seen.map((p) => p.fraction);
    expect(fractions[0]).toBe(0);
    for (let i = 1; i < fractions.length; i++) expect(fractions[i]).toBeGreaterThan(fractions[i - 1]);
    expect(fractions[fractions.length - 1]).toBeLessThan(1);
    for (const label of seen.map((p) => p.label)) expect(label.split(" ").length).toBeLessThanOrEqual(5);
  });
});

describe("chapter references are saved with names when the editors finish", () => {
  it("'[n]' in a flag is stored as '[n: name]' and still names the right chapter after reordering", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>For my father.</p>", "front", "DEDICATION");
    const departure = await chapter(m, "<p>Four years away.</p>", "chapter", "Departure");
    const ret = await chapter(m, "<p>Five years away.</p>", "chapter", "Return");
    mockFetch((call) => {
      if (isSummaryCall(call)) return openAiReply("SUMMARY");
      // Only the first editor raises anything: a whole-book flag citing [2] and [3].
      return /story structure/i.test(String(call.body.messages[0].content))
        ? openAiReply('[{"chapter":0,"comment":"Four years in [2] but five in [3]."}]')
        : openAiReply("[]");
    });

    await runDevelopmentalReview(m, S);

    const flag = (await db.suggestions.toArray()).find((s) => s.stage === "developmental")!;
    expect(flag.comment).toBe("Whole book: Four years in [2: Chapter 1: Departure] but five in [3: Chapter 2: Return].");

    // Revising: a new chapter goes in first, so today "[2]" would be a different chapter.
    const { citedChapters, expandChapterRefs, briefOrder } = await import("@/lib/chapterRefs");
    const prologue = await chapter(m, "<p>New.</p>", "chapter", "Prologue");
    await db.chapters.update(prologue.id, { order: -1 });
    const ordered = briefOrder(await db.chapters.where("manuscriptId").equals(m.id).toArray());
    expect(ordered[1].title).toBe("Prologue");

    expect(citedChapters(flag.comment, ordered).map((c) => c.id)).toEqual([departure.id, ret.id]);
    expect(expandChapterRefs(flag.comment, ordered)).toBe(flag.comment);
  });
});
