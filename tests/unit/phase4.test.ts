import { describe, expect, it } from "vitest";
import { db, deleteManuscript, type AiSettings } from "@/db/schema";
import { planImport } from "@/lib/importManuscript";
import { createTranslation, splitLongBlock, translateChapter } from "@/lib/translate";
import { chapter, mockFetch, openAiReply, seedBook, type Call } from "./helpers";

// Extra checks for the Low findings fixed in Phase 4, beyond the audit's own BUG-* tests.

const AI: AiSettings = { provider: "openai", apiKey: "test-key", model: "m" };

/** Returns every string it was sent, unchanged, as if translated word for word. */
const identity = (c: Call) => {
  const prompt: string = c.body.messages[1].content;
  return openAiReply(prompt.slice(prompt.indexOf("[")));
};

describe("F20: splitting long paragraphs for translation", () => {
  it("cuts at sentence ends and keeps the spaces between pieces", () => {
    const text = Array.from({ length: 400 }, (_, i) => `Sentence number ${i}.`).join(" ");
    const pieces = splitLongBlock(text, 1000);
    expect(pieces.length).toBeGreaterThan(5);
    for (const p of pieces) expect(p.html.length).toBeLessThanOrEqual(1000);
    for (const p of pieces.slice(0, -1)) expect(p.html.endsWith(".")).toBe(true);
    expect(pieces.map((p) => p.html + p.joiner).join("")).toBe(text);
  });

  it("never cuts inside an HTML tag", () => {
    const text = Array.from({ length: 300 }, (_, i) => `Word <a href="https://example.com/${i}">link ${i}</a>`).join(" ");
    for (const p of splitLongBlock(text, 700)) {
      expect(p.html.lastIndexOf("<")).toBeLessThanOrEqual(p.html.lastIndexOf(">"));
    }
  });

  it("puts a long paragraph back together whole after translation, formatting included", async () => {
    const { m } = await seedBook();
    const sentences = Array.from({ length: 600 }, (_, i) => (i === 300 ? `<em>Middle ${i}.</em>` : `Line ${i}.`)).join(" ");
    const src = await chapter(m, `<p>${sentences}</p>`, "chapter", "Uno");
    const tr = await createTranslation(m, { code: "es", name: "Spanish" });
    const tch = (await db.chapters.where("manuscriptId").equals(tr.id).toArray())[0];
    const calls = mockFetch(identity);

    await translateChapter(AI, src, tch, { code: "es", name: "Spanish" });

    expect(calls.length).toBeGreaterThan(1);
    const out = (await db.chapters.get(tch.id))!.content;
    expect(out).toBe(`<p>${sentences}</p>`);
  });
});

describe("F19: damaged files", () => {
  it("a corrupt .epub also gets a plain message", async () => {
    const file = new File(["not a zip"], "book.epub");
    await expect(planImport(file)).rejects.toThrow(/Could not read "book.epub"/);
  });
});

describe("F16: deleting the open book", () => {
  it("deleteManuscript clears the active-manuscript setting but keeps the workspace one", async () => {
    const { ws, m } = await seedBook();
    await db.settings.bulkPut([{ key: "activeWorkspaceId", value: ws.id }, { key: "activeManuscriptId", value: m.id }]);
    await deleteManuscript(m.id);
    expect(await db.settings.get("activeManuscriptId")).toBeUndefined();
    expect((await db.settings.get("activeWorkspaceId"))?.value).toBe(ws.id);
  });
});
