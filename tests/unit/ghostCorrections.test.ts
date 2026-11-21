import { describe, expect, it } from "vitest";
import { db, newId, type AiSettings, type Suggestion } from "@/db/schema";
import { briefOrder, citedChapters, expandChapterRefs, requestWholeBookCorrections, settleFlagIfDone } from "@/lib/ghostCorrections";
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
  it("asks about the whole book with the cited chapters in full, and keeps only exact, single quotes", async () => {
    const { m, two, flag } = await memoir();
    const calls = mockFetch(openAiReply(JSON.stringify({
      plan: "Four years abroad: left 1998, home 2002.",
      corrections: [
        { chapter: 3, original: "After five years abroad I came home in 2004.", replacement: "After four years abroad I came home in 2002.", comment: "Matches the timeline." },
        { chapter: 3, original: "a sentence that is not in the chapter", replacement: "x", comment: "" },
        { chapter: 2, original: "four years", replacement: "four years", comment: "no change" },
        { chapter: 42, original: "anything", replacement: "y", comment: "" },
      ],
    })));

    const result = await requestWholeBookCorrections(S, m, flag);

    const sent = calls[0].body.messages.at(-1).content as string;
    expect(sent).toContain("about the whole book, not one chapter");
    expect(sent).not.toContain("DEDICATION\": \"");
    expect(sent).toContain("[2: Chapter 1: Departure]");
    expect(sent).toContain("I stayed in Thailand for four years.");
    expect(sent).toContain("After five years abroad I came home in 2004.");
    expect([result.saved, result.dropped, result.chapters.map((c) => c.id)]).toEqual([1, 3, [two.id]]);

    const saved = (await db.suggestions.toArray()).filter((s) => s.forFlag === flag.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ chapterId: two.id, kind: "change", stage: "developmental", agent: "Ghostwriter", status: "pending" });
    expect((await db.suggestions.get(flag.id))?.ghostPlan).toBe("Four years abroad: left 1998, home 2002.");
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
