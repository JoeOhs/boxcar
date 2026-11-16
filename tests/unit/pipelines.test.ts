import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { db, type AiSettings, type Chapter, type Manuscript } from "@/db/schema";
import { buildEpub } from "@/lib/epub";
import { buildDraftDocx } from "@/lib/docx";
import { planImport, importManuscript } from "@/lib/importManuscript";
import { createTranslation, proofreadTranslation, setChapterApproved, syncTranslationChapters, translateChapter } from "@/lib/translate";
import { buildAudiobook, speechPieces } from "@/lib/narration";
import { chapter, json, mockFetch, openAiReply, seedBook } from "./helpers";

const AI: AiSettings = { provider: "openai", apiKey: "test-key", model: "m" };

async function exportBook() {
  const { ws, m } = await seedBook("My Book");
  await db.manuscripts.update(m.id, {
    language: "fr", isbn: "9780000000002", description: "Desc & more", keywords: ["k1", "k2"],
    cover: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
  });
  await chapter(m, "<p>Back text</p>", "back", "About the Author");
  await chapter(m, "<p>Second body</p>", "chapter", "Two");
  await chapter(m, "<p>First body 👋</p>", "chapter", "One");
  await chapter(m, "<p>SCRAPPED</p>", "scrap", "Scrap bin");
  await chapter(m, "<p>For mum</p>", "front", "Dedication");
  // Put "Two" after "One": the order field decides, not creation time.
  const all = await db.chapters.toArray();
  await db.chapters.update(all.find((c) => c.title === "One")!.id, { order: 0 });
  await db.chapters.update(all.find((c) => c.title === "Two")!.id, { order: 1 });
  return { ws, m: (await db.manuscripts.get(m.id))!, chapters: await db.chapters.toArray() };
}

describe("EPUB export", () => {
  it("has a valid package structure, metadata, cover, order and no scrap", async () => {
    const { m, chapters } = await exportBook();
    const zip = await JSZip.loadAsync(await (await buildEpub(m, "Pen Name", chapters)).arrayBuffer());
    const names = Object.keys(zip.files);
    expect(names[0]).toBe("mimetype");
    expect(await zip.file("mimetype")!.async("string")).toBe("application/epub+zip");
    const raw = new Uint8Array(await (await buildEpub(m, "Pen Name", chapters)).arrayBuffer());
    expect([raw[8], raw[9]]).toEqual([0, 0]); // mimetype entry is STOREd (uncompressed)
    const container = await zip.file("META-INF/container.xml")!.async("string");
    const opfPath = /full-path="([^"]+)"/.exec(container)![1];
    const opf = await zip.file(opfPath)!.async("string");
    for (const s of ["<dc:title>My Book</dc:title>", "<dc:creator>Pen Name</dc:creator>", "<dc:language>fr</dc:language>", "urn:isbn:9780000000002", "Desc &amp; more", "<dc:subject>k1</dc:subject>", 'properties="cover-image"', 'properties="nav"', "dcterms:modified"]) {
      expect(opf).toContain(s);
    }
    // every manifest href exists in the zip; spine refs exist in the manifest
    const base = opfPath.replace(/[^/]+$/, "");
    const hrefs = [...opf.matchAll(/<item [^>]*href="([^"]+)"/g)].map((x) => base + x[1]);
    for (const h of hrefs) expect(names).toContain(h);
    const ids = new Set([...opf.matchAll(/<item [^>]*id="([^"]+)"/g)].map((x) => x[1]));
    const spine = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((x) => x[1]);
    for (const s of spine) expect(ids.has(s)).toBe(true);
    // reading order: front, One, Two, back; scrap absent
    const text = (await Promise.all(spine.map(async (id) => {
      const href = new RegExp(`id="${id}" href="([^"]+)"`).exec(opf)?.[1];
      return href ? zip.file(base + href)!.async("string") : "";
    }))).join("\n");
    const pos = ["For mum", "First body", "Second body", "Back text"].map((t) => text.indexOf(t));
    expect(pos.every((p, i) => p > -1 && (i === 0 || p > pos[i - 1]))).toBe(true);
    expect(text).not.toContain("SCRAPPED");
    expect(text).toContain("👋");
  });
  it("RTL language: no dir / page-progression-direction written (finding)", async () => {
    const { m, chapters } = await exportBook();
    const zip = await JSZip.loadAsync(await (await buildEpub({ ...m, language: "ar" }, "A", chapters)).arrayBuffer());
    const opf = Object.keys(zip.files).find((n) => n.endsWith(".opf"))!;
    const s = await zip.file(opf)!.async("string");
    expect(s.includes("page-progression-direction")).toBe(false); // documents current (missing) behaviour
  });
});

describe("DOCX draft export", () => {
  it("is a zip with document.xml in order, scrap excluded", async () => {
    const { m, chapters } = await exportBook();
    const zip = await JSZip.loadAsync(await (await buildDraftDocx(m, "Pen Name", chapters)).arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]));
    const doc = await zip.file("word/document.xml")!.async("string");
    const pos = ["My Book", "For mum", "First body", "Second body", "Back text"].map((t) => doc.indexOf(t));
    expect(pos.every((p, i) => p > -1 && (i === 0 || p > pos[i - 1]))).toBe(true);
    expect(doc).not.toContain("SCRAPPED");
  });
});

describe("import", () => {
  const file = (name: string, body: BlobPart) => new File([body], name);
  it(".txt splits on chapter headings", async () => {
    const plan = await planImport(file("my-novel.txt", "Chapter 1\n\nIt was a dark night and the wind howled.\n\nChapter 2: Dawn\n\nMorning came at last."));
    expect(plan.chapters.map((c) => c.title)).toEqual(["", "Dawn"]);
    expect(plan.title).toBeTruthy();
  });
  it(".md headings and .html h1/h2", async () => {
    const md = await planImport(file("b.md", "# Title\n\n## Chapter One\n\nText *here* is enough.\n\n## Chapter Two\n\nMore text."));
    expect(md.chapters.length).toBe(2);
    const html = await planImport(file("b.html", "<html><head><title>H</title></head><body><h2>Chapter 1</h2><p>Para one.</p><h2>Chapter 2</h2><p>Para two.</p></body></html>"));
    expect(html.chapters.length).toBe(2);
    expect(html.title).toBe("H");
  });
  it(".epub and .docx produced by this app round-trip back in", async () => {
    const { m, chapters, ws } = await exportBook();
    const epub = await buildEpub(m, "Pen Name", chapters);
    const plan = await planImport(file("book.epub", await epub.arrayBuffer()));
    expect(plan.title).toBe("My Book");
    expect(plan.author).toBe("Pen Name");
    expect(plan.language).toBe("fr");
    expect(plan.chapters.filter((c) => c.html.includes("First body")).length).toBe(1);
    const docx = await buildDraftDocx(m, "Pen Name", chapters);
    const dplan = await planImport(file("book.docx", await docx.arrayBuffer()));
    expect(dplan.chapters.some((c) => c.html.includes("First body"))).toBe(true);
    const made = await importManuscript(ws, plan);
    expect((await db.manuscripts.get(made.id))!.status).toBe("drafting");
    expect(await db.chapters.where("manuscriptId").equals(made.id).count()).toBe(4);
  });
  it("F10: re-importing our own EPUB gives back exactly the original chapters", async () => {
    const { m, chapters } = await exportBook();
    const plan = await planImport(file("book.epub", await (await buildEpub(m, "Pen Name", chapters)).arrayBuffer()));
    expect(plan.chapters.map((c) => [c.kind, c.title])).toEqual([["front", "Dedication"], ["chapter", "One"], ["chapter", "Two"], ["back", "About the Author"]]);
  });
  it("corrupt .docx / .epub and unknown extensions give a readable error", async () => {
    await expect(planImport(file("x.docx", "not a zip"))).rejects.toThrow();
    await expect(planImport(file("x.epub", "not a zip"))).rejects.toThrow();
    await expect(planImport(file("x.pdf", "%PDF"))).rejects.toThrow(/cannot be read/);
    await expect(planImport(file("x.txt", "   \n  "))).rejects.toThrow(/No text/);
  });
  it("F19: a corrupt .docx shows a plain message, not a raw JSZip error", async () => {
    await expect(planImport(file("x.docx", "not a zip"))).rejects.toThrow(/(cannot|could not) read|not a/i);
  });
});

describe("translation", () => {
  async function setup(html: string) {
    const { m } = await seedBook();
    const src = await chapter(m, html, "chapter", "Uno");
    const tr = await createTranslation(m, { code: "es", name: "Spanish" });
    const tch = (await db.chapters.where("manuscriptId").equals(tr.id).toArray())[0];
    return { m, src, tr, tch };
  }
  const echo = (prefix = "ES:") => (c: { body: { messages: { content: string }[] } }) => {
    const arr = JSON.parse(c.body.messages[1].content.slice(c.body.messages[1].content.indexOf("[")));
    return openAiReply(JSON.stringify(arr.map((s: string) => s.replace(/>([^<]+)</g, `>${prefix}$1<`).replace(/^([^<]+)$/, `${prefix}$1`))));
  };
  it("pending -> translated -> proofread -> approved, tags preserved", async () => {
    const { src, tch } = await setup("Loose opening.<p>Hello <em>world</em>.</p>");
    expect(tch.translationState).toBe("pending");
    mockFetch(echo());
    await translateChapter(AI, src, tch, { code: "es", name: "Spanish" });
    let t = (await db.chapters.get(tch.id))!;
    expect(t.translationState).toBe("translated");
    expect(t.title).toBe("ES:Uno");
    expect(t.content).toContain("<em>");
    expect(t.content).toContain("Loose opening"); // wrapped into a paragraph and sent
    mockFetch(openAiReply('[{"original":"ES:","replacement":"","comment":"prefix"}]'));
    expect(await proofreadTranslation(AI, t)).toBe(1);
    t = (await db.chapters.get(tch.id))!;
    expect(t.translationState).toBe("proofread");
    await setChapterApproved(t.id, true);
    expect((await db.chapters.get(tch.id))!.translationState).toBe("approved");
  });
  it("batches at 5,000 characters and never sends the whole chapter at once", async () => {
    const paras = Array.from({ length: 30 }, (_, i) => `<p>${String(i).padStart(2, "0")} ${"x".repeat(480)}</p>`).join("");
    const { src, tch } = await setup(paras);
    const calls = mockFetch(echo());
    await translateChapter(AI, src, tch, { code: "es", name: "Spanish" });
    expect(calls.length).toBeGreaterThan(2);
    for (const c of calls) expect(c.body.messages[1].content.length).toBeLessThan(5000 + 1500);
  });
  it("a failed batch mid-chapter leaves the stored chapter untouched", async () => {
    const paras = Array.from({ length: 30 }, () => `<p>${"y".repeat(480)}</p>`).join("");
    const { src, tch } = await setup(paras);
    mockFetch(echo(), json({ error: { message: "Rate limit" } }, 429));
    await expect(translateChapter(AI, src, tch, { code: "es", name: "Spanish" })).rejects.toThrow(/Rate limit/);
    const t = (await db.chapters.get(tch.id))!;
    expect([t.translationState, t.content]).toEqual(["pending", ""]);
  });
  it("wrong-length reply is rejected", async () => {
    const { src, tch } = await setup("<p>a</p><p>b</p>");
    mockFetch(openAiReply('["solo"]'));
    await expect(translateChapter(AI, src, tch, { code: "es", name: "Spanish" })).rejects.toThrow(/wrong shape/);
  });
  it("F02: javascript: links from the AI are removed by the sanitiser", async () => {
    const { src, tch } = await setup("<p>Click me</p>");
    mockFetch(openAiReply('["Uno","<a href=\\"javascript:alert(1)\\">Haz clic</a>"]'));
    await translateChapter(AI, src, tch, { code: "es", name: "Spanish" });
    expect((await db.chapters.get(tch.id))!.content).not.toContain("javascript:");
  });
  it("F20: a single paragraph over BATCH_CHARACTERS is split across requests", async () => {
    const { src, tch } = await setup(`<p>${"z".repeat(20000)}</p>`);
    const calls = mockFetch(echo());
    await translateChapter(AI, src, tch, { code: "es", name: "Spanish" });
    for (const c of calls) expect(c.body.messages[1].content.length).toBeLessThan(6500);
  });
  it("F11: chapters added to the original later are laid out in the translation; translated text is kept", async () => {
    const { m, tr, tch } = await setup("<p>a</p>");
    await db.chapters.update(tch.id, { content: "<p>ya traducido</p>", translationState: "approved" });
    const dos = await chapter(m, "<p>new</p>", "chapter", "Dos");
    await chapter(m, "<p>scrap</p>", "scrap", "Scrap bin");
    expect(await syncTranslationChapters(tr.id)).toBe(1);
    const rows = await db.chapters.where("manuscriptId").equals(tr.id).toArray();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.sourceChapterId === dos.id)).toMatchObject({ translationState: "pending", content: "", order: dos.order });
    expect((await db.chapters.get(tch.id))!).toMatchObject({ content: "<p>ya traducido</p>", translationState: "approved" });
    expect(await syncTranslationChapters(tr.id)).toBe(0); // running it again adds nothing
  });
  it("F11: a chapter moved in the original takes its new place in the translation", async () => {
    const { src, tr, tch } = await setup("<p>a</p>");
    await db.chapters.update(src.id, { kind: "back", order: 3 });
    await syncTranslationChapters(tr.id);
    expect((await db.chapters.get(tch.id))!).toMatchObject({ kind: "back", order: 3 });
  });
});

describe("narration", () => {
  it("speechPieces keeps every piece under the limit and loses no text", () => {
    const paras = ["a ".repeat(3000).trim(), "short", "b".repeat(9000)];
    const pieces = speechPieces(paras, 3500);
    expect(pieces.every((p) => p.length <= 3500)).toBe(true);
    expect(pieces.join("").replace(/\s/g, "").length).toBe(paras.join("").replace(/\s/g, "").length);
  });
  it("buildAudiobook makes one MP3 per readable chapter, skipping scrap", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>Hello one.</p>", "chapter", "One");
    await chapter(m, "<p>* * *</p>", "chapter", "Empty");
    await chapter(m, "<p>scrap</p>", "scrap", "Scrap bin");
    const calls = mockFetch(() => new Response(new Uint8Array([0x49, 0x44, 0x33]), { status: 200 }));
    const progress: string[] = [];
    const blob = await buildAudiobook("test-key", (await db.manuscripts.get(m.id)) as Manuscript, (await db.chapters.toArray()) as Chapter[], "alloy", (s) => progress.push(s));
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files)).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.openai.com/v1/audio/speech");
    expect(calls[0].body).toMatchObject({ model: "gpt-4o-mini-tts", voice: "alloy", response_format: "mp3" });
  });
});
