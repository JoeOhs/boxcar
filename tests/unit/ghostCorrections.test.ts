import { describe, expect, it } from "vitest";
import { db, newId, type AiSettings, type Chapter, type Suggestion } from "@/db/schema";
import { briefOrder, citedChapters, expandChapterRefs, locateQuote, requestWholeBookCorrections, settleFlagIfDone } from "@/lib/ghostCorrections";
import { describeResult } from "@/lib/ghostRuns";
import { htmlToText } from "@/lib/text";
import { chapter, mockFetch, openAiReply, seedBook } from "./helpers";

const S: AiSettings = { provider: "openai", apiKey: "k", model: "m" };

/** A book like the one that showed the problem: front matter first, so a whole-book flag is filed under it. */
async function memoir() {
  const { m } = await seedBook();
  const dedication = await chapter(m, "<p>For my father.</p>", "front", "DEDICATION");
  const one = await chapter(m, "<p>I stayed in Thailand for four years.</p>", "chapter", "Departure");
  const two = await chapter(m, "<p>After five years abroad I came home in 2004.</p>", "chapter", "Return");
  const flag: Suggestion = {
    id: newId(), chapterId: dedication.id, manuscriptId: m.id, source: "ai", role: "dev-editor", agent: "Story structure editor",
    stage: "developmental", kind: "note", original: "", replacement: "", status: "pending", createdAt: Date.now(),
    comment: "Whole book: The stay lasts four years in [2] but five in [3]. Fix: one master timeline.",
  };
  await db.suggestions.add(flag);
  return { m, dedication, one, two, flag };
}

describe("chapter references in flags", () => {
  it("[n] is the editors' numbering (front matter included) and is shown with the chapter's name", async () => {
    const { m, one, two } = await memoir();
    const ordered = briefOrder(await db.chapters.where("manuscriptId").equals(m.id).toArray());
    expect(citedChapters("four years in [2] but five in [3]; also [2] and [99]", ordered).map((c) => c.id)).toEqual([one.id, two.id]);
    expect(expandChapterRefs("in [2] but [3], not [99]", ordered)).toBe("in [2: Chapter 1: Departure] but [3: Chapter 2: Return], not [99]");
  });
});

describe("Ghostwriter corrections for a whole-book flag", () => {
  it("asks about the whole book with the cited chapters in full; a quote it can't place is kept to make by hand", async () => {
    const { m, two, flag } = await memoir();
    const calls = mockFetch(openAiReply(JSON.stringify({
      plan: "Four years abroad: left 1998, home 2002.",
      corrections: [
        { chapter: 3, original: "After five years abroad I came home in 2004.", replacement: "After four years abroad I came home in 2002.", comment: "Matches the timeline." },
        { chapter: 3, original: "a sentence that is not in the chapter", replacement: "x", comment: "" },
        { chapter: 2, original: "four years", replacement: "four years", comment: "no change" },
      ],
    })));

    const result = await requestWholeBookCorrections(S, m, flag);

    const sent = calls[0].body.messages.at(-1).content as string;
    expect(sent).toContain("about the whole book, not one chapter");
    expect(sent).not.toContain("DEDICATION\": \"");
    expect(sent).toContain("[2: Chapter 1: Departure]");
    expect(sent).toContain("=== KEY 3 · Chapter 2: Return ===");
    expect(sent).toContain("I stayed in Thailand for four years.");
    expect(sent).toContain("After five years abroad I came home in 2004.");
    expect([result.saved, result.byHand, result.skipped, result.chapters.map((c) => c.id)]).toEqual([1, ["missing"], 1, [two.id]]);

    const saved = (await db.suggestions.toArray()).filter((s) => s.forFlag === flag.id).sort((a, b) => a.createdAt - b.createdAt);
    expect(saved.map((s) => s.kind)).toEqual(["change", "note"]);
    expect(saved[0]).toMatchObject({ chapterId: two.id, stage: "developmental", agent: "Ghostwriter", status: "pending" });
    expect(saved[1]).toMatchObject({ chapterId: two.id, original: "a sentence that is not in the chapter", replacement: "x" });
    expect((await db.suggestions.get(flag.id))?.ghostPlan).toBe("Four years abroad: left 1998, home 2002.");
  });

  it("matches despite curly quotes, dashes and spacing, and saves the chapter's own wording", async () => {
    const { m } = await seedBook();
    const c = await chapter(m, "<p>I’d been gone — five long years — when I came home.</p>", "chapter", "Home");
    expect(locateQuote(htmlToText(c.content), "I'd been gone - five long  years - when I came home.")).toEqual({
      original: "I’d been gone — five long years — when I came home.",
    });
    expect(locateQuote("A day. A day.", "A day.")).toEqual({ problem: "repeated" });
    expect(locateQuote("The end of one.\nThe start of two.", "one. The start")).toEqual({ problem: "paragraphs" });
    expect(locateQuote("Nothing like it.", "Something else.")).toEqual({ problem: "missing" });
  });

  it("a correction filed under the wrong chapter number is placed in the one chapter that has it", async () => {
    const { m, two, flag } = await memoir();
    // The model answered 2 (or a chapter number from a title) for a quote that is in KEY 3.
    mockFetch(openAiReply(JSON.stringify({
      plan: "",
      corrections: [{ chapter: 2, original: "After five years abroad I came home in 2004.", replacement: "After four years abroad I came home in 2002.", comment: "" }],
    })));
    const result = await requestWholeBookCorrections(S, m, flag);
    expect([result.saved, result.byHand]).toEqual([1, []]);
    expect((await db.suggestions.toArray()).find((s) => s.forFlag === flag.id)).toMatchObject({ chapterId: two.id, kind: "change" });
  });

  it("the message says how many are ready and why the rest are by hand", () => {
    const chapters = [{ title: "Return" }] as Chapter[];
    expect(describeResult({ saved: 2, byHand: ["missing"], skipped: 0, chapters })).toBe(
      "The Ghostwriter proposed 3 corrections in Return. 1 couldn't be matched to the text exactly (its wording isn't in the chapter), so it is shown for you to make by hand.",
    );
    expect(describeResult({ saved: 0, byHand: ["missing", "repeated", "missing"], skipped: 0, chapters })).toBe(
      "The Ghostwriter proposed 3 corrections in Return. None could be matched to the text exactly (its wording isn't in the chapter; the passage appears more than once), so each is shown for you to make by hand.",
    );
  });

  it("asking again replaces corrections still waiting; the flag is Accepted once each is settled", async () => {
    const { m, flag } = await memoir();
    const reply = openAiReply(JSON.stringify({
      plan: "",
      corrections: [{ chapter: 3, original: "came home in 2004", replacement: "came home in 2002", comment: "" }],
    }));
    mockFetch(reply);
    await requestWholeBookCorrections(S, m, flag);
    mockFetch(reply);
    await requestWholeBookCorrections(S, m, flag);
    const fixes = (await db.suggestions.toArray()).filter((s) => s.forFlag === flag.id);
    expect(fixes).toHaveLength(1);

    await db.suggestions.update(fixes[0].id, { status: "rejected" });
    await settleFlagIfDone(fixes[0]);
    expect((await db.suggestions.get(flag.id))?.status).toBe("accepted");
  });

  it("a reply in the wrong shape is a clear error and saves nothing", async () => {
    const { m, flag } = await memoir();
    mockFetch(openAiReply('{"plan":"x"}'));
    await expect(requestWholeBookCorrections(S, m, flag)).rejects.toThrow(/wrong shape/);
    expect((await db.suggestions.toArray()).filter((s) => s.forFlag)).toHaveLength(0);
  });
});

describe("the Ghostwriter's work runs outside any screen", () => {
  it("is busy while it reads, then reports what it proposed; with no key it says so", async () => {
    const { currentGhostRuns, startCorrections } = await import("@/lib/ghostRuns");
    const { m, flag } = await memoir();
    startCorrections(null, true, m, flag);
    expect(currentGhostRuns()[flag.id]).toEqual({ busy: false, ok: false, text: "Add your AI key in Settings first." });

    mockFetch(openAiReply(JSON.stringify({ plan: "", corrections: [{ chapter: 3, original: "came home in 2004", replacement: "came home in 2002", comment: "" }] })));
    startCorrections(S, true, m, flag);
    expect(currentGhostRuns()[flag.id].busy).toBe(true);
    startCorrections(S, true, m, flag); // a second press while it works does nothing
    await expect.poll(() => currentGhostRuns()[flag.id].busy).toBe(false);
    expect(currentGhostRuns()[flag.id]).toMatchObject({ ok: true, text: "The Ghostwriter proposed 1 correction in Return." });
  });
});
