import { describe, expect, it, vi } from "vitest";
import type { AiSettings } from "@/db/schema";
import { askAi, chapterParts, parseJson, requestFormatPreset, requestStageReview } from "@/lib/ai";
import { replaceInHtml } from "@/lib/text";
import { json, mockFetch, openAiReply } from "./helpers";

const S = (provider: AiSettings["provider"], extra: Partial<AiSettings> = {}): AiSettings => ({
  provider, apiKey: "test-key-0000", model: "m-1", ...extra,
});

describe("parseJson", () => {
  it("handles prose and code fences", () => {
    expect(parseJson('Sure!\n```json\n[{"a":1}]\n```', "[")).toEqual([{ a: 1 }]);
    expect(parseJson('{"preset":"x"}', "{")).toEqual({ preset: "x" });
  });
  it.each(["", "no json here", '[{"a":1}', '[{"a": 1,]'])("rejects %j with a user-facing error", (reply) => {
    expect(() => parseJson(reply, "[")).toThrow(/expected format/);
  });
  it("F18: a bracketed aside in prose before the array still parses", () => {
    expect(parseJson('[Note] here you go: [{"a":1}]', "[")).toEqual([{ a: 1 }]);
  });
});

describe("provider requests", () => {
  it("OpenAI: URL, bearer header, system message first", async () => {
    const calls = mockFetch(openAiReply(" hi "));
    expect(await askAi(S("openai"), "sys", [{ role: "user", content: "u" }])).toBe("hi");
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer test-key-0000");
    expect(calls[0].body).toEqual({ model: "m-1", messages: [{ role: "system", content: "sys" }, { role: "user", content: "u" }] });
  });
  it("Anthropic: x-api-key, version header, system as top-level field", async () => {
    const calls = mockFetch(json({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] }));
    expect(await askAi(S("anthropic"), "sys", [{ role: "user", content: "u" }])).toBe("a\nb");
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect([h["x-api-key"], h["anthropic-version"], h["anthropic-dangerous-direct-browser-access"]]).toEqual(["test-key-0000", "2023-06-01", "true"]);
    expect(calls[0].body).toMatchObject({ model: "m-1", system: "sys", max_tokens: 4096, messages: [{ role: "user", content: "u" }] });
  });
  it("Hugging Face router, Ollama (no key), Ollama Cloud URLs", async () => {
    const calls = mockFetch(openAiReply("ok"));
    await askAi(S("huggingface"), "s", []);
    await askAi(S("ollama", { apiKey: "", baseUrl: "http://localhost:11434/" }), "s", []);
    await askAi(S("ollama-cloud"), "s", []);
    expect(calls.map((c) => c.url)).toEqual([
      "https://router.huggingface.co/v1/chat/completions",
      "http://localhost:11434/v1/chat/completions",
      "https://ollama.com/v1/chat/completions",
    ]);
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it.each([
    [401, { error: { message: "Incorrect API key" } }, /Incorrect API key/],
    [429, { error: { message: "Rate limit" } }, /Rate limit/],
    [500, null, /answered 500/],
    [200, { choices: [] }, /empty reply/],
  ])("HTTP %i surfaces a readable error", async (status, body, msg) => {
    mockFetch(new Response(body === null ? "<html>oops</html>" : JSON.stringify(body), { status }));
    await expect(askAi(S("openai"), "s", [])).rejects.toThrow(msg);
  });
  it("network failure and offline give clear messages", async () => {
    mockFetch(new TypeError("Failed to fetch"));
    await expect(askAi(S("openai"), "s", [])).rejects.toThrow(/Could not reach the AI provider/);
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await expect(askAi(S("anthropic"), "s", [])).rejects.toThrow(/offline/);
    await expect(askAi(S("openai", { apiKey: " " }), "s", [])).rejects.toThrow(/offline/);
  });
  it("missing key is refused before any request", async () => {
    const calls = mockFetch(openAiReply("x"));
    await expect(askAi(S("openai", { apiKey: "  " }), "s", [])).rejects.toThrow(/Add your AI key/);
    expect(calls).toHaveLength(0);
  });
  it("F01: a request that never answers times out with a clear message", async () => {
    vi.useFakeTimers();
    // Like real fetch, the mock rejects when its signal is aborted.
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_r, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const pending = askAi(S("openai"), "s", []);
    const check = expect(pending).rejects.toThrow(/did not answer within 120 seconds/);
    await vi.advanceTimersByTimeAsync(120_000);
    await check;
    vi.useRealTimers();
  });
});

describe("requestStageReview / requestFormatPreset consumers", () => {
  it("change passes keep only valid change objects", async () => {
    mockFetch(openAiReply('```json\n[{"original":"teh","replacement":"the","comment":"typo"},{"original":"x","replacement":"x"},{"bad":1},"str",null]\n```'));
    expect(await requestStageReview(S("openai"), "proofread", "teh cat", "", "")).toEqual([
      { kind: "change", original: "teh", replacement: "the", comment: "typo" },
    ]);
  });
  it("developmental pass returns notes", async () => {
    mockFetch(openAiReply('[{"passage":"","comment":"Arc is weak"},{"passage":"x","comment":""}]'));
    expect(await requestStageReview(S("openai"), "developmental", "t", "", "")).toEqual([
      { kind: "note", original: "", replacement: "", comment: "Arc is weak" },
    ]);
  });
  it("truncated reply surfaces an error instead of dropping silently", async () => {
    mockFetch(openAiReply('[{"original":"a","replacement":"b","comm'));
    await expect(requestStageReview(S("openai"), "line", "a", "", "")).rejects.toThrow(/expected format/);
  });
  it("an object instead of an array is rejected", async () => {
    mockFetch(openAiReply('{"original":"a"}'));
    await expect(requestStageReview(S("openai"), "line", "a", "", "")).rejects.toThrow();
  });
  it("F09: a chapter over 24,000 characters is reviewed in parts, and every part is sent", async () => {
    const calls = mockFetch(openAiReply("[]"));
    const paragraphs = Array.from({ length: 60 }, (_, i) => `P${i} ${"word ".repeat(200)}`);
    const long = paragraphs.join("\n") + "\nTHE-END";
    await requestStageReview(S("openai"), "proofread", long, "", "");
    expect(calls.length).toBeGreaterThan(1);
    const sent = calls.map((c) => c.body.messages[1].content as string);
    expect(sent.some((s) => s.includes("THE-END"))).toBe(true);
    for (let i = 0; i < 60; i++) expect(sent.filter((s) => s.includes(`P${i} `)).length).toBe(1);
    expect(sent[0]).toContain(`part 1 of ${calls.length}`);
  });
  it("F09: edits from every part are merged; a failing part fails the whole review", async () => {
    const long = `${"a ".repeat(6000)}\n${"b ".repeat(6000)}`; // two 12,000-char paragraphs = two parts
    mockFetch(openAiReply('[{"original":"a a","replacement":"A","comment":"1"}]'), openAiReply('[{"original":"b b","replacement":"B","comment":"2"}]'));
    expect((await requestStageReview(S("openai"), "line", long, "", "")).map((e) => e.comment)).toEqual(["1", "2"]);
    mockFetch(openAiReply("[]"), json({ error: { message: "Rate limit" } }, 429));
    await expect(requestStageReview(S("openai"), "line", long, "", "")).rejects.toThrow(/Rate limit/);
  });
  it("chapterParts keeps paragraphs whole, splits only oversized ones, and loses no text", () => {
    expect(chapterParts("short", 100)).toEqual(["short"]);
    expect(chapterParts("", 100)).toEqual([""]);
    expect(chapterParts("aaaa\nbbbb\ncccc", 10)).toEqual(["aaaa\nbbbb", "cccc"]);
    const huge = "One sentence here. ".repeat(20).trim();
    const parts = chapterParts(huge, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.every((p) => p.trim().endsWith("."))).toBe(true);
    expect(parts.join(" ").replace(/\s+/g, " ")).toBe(huge);
    expect(chapterParts("x".repeat(250), 100).map((p) => p.length)).toEqual([100, 100, 50]);
  });
  it("format preset: unknown preset id is an error", async () => {
    mockFetch(openAiReply('{"preset":"nope","reason":"r"}'));
    await expect(requestFormatPreset(S("openai"), { title: "t", subtitle: "", description: "", keywords: [], wordCount: 1, chapterCount: 1, sample: "" })).rejects.toThrow(/did not name/);
  });
});

describe("applying a suggestion (replaceInHtml)", () => {
  const html = (r: ReturnType<typeof replaceInHtml>) => (r.ok ? r.html : r.reason);
  it("replaces inside a text node and keeps formatting", () => {
    expect(html(replaceInHtml("<p>The <em>cat</em> sat.</p>", "sat", "lay"))).toBe("<p>The <em>cat</em> lay.</p>");
  });
  it("reports a missing passage (chapter changed) or an empty one", () => {
    expect(html(replaceInHtml("<p>New text</p>", "old text", "x"))).toBe("missing");
    expect(html(replaceInHtml("<p>x</p>", "", "y"))).toBe("missing");
  });
  it("F04: a passage that appears twice is refused, not applied to the first match", () => {
    const src = "<p>He said no.</p><p>She said no.</p>";
    expect(html(replaceInHtml(src, "said no", "said yes"))).toBe("ambiguous");
    expect(html(replaceInHtml("<p>no no</p>", "no", "yes"))).toBe("ambiguous");
    expect(html(replaceInHtml(src, "She said no", "She said yes"))).toBe("<p>He said no.</p><p>She said yes.</p>");
  });
  it("F04: a passage spanning formatting keeps the formatting around it", () => {
    expect(html(replaceInHtml("<p><strong>Bold</strong> and <em>very</em> long</p>", "and very", "and quite")))
      .toBe("<p><strong>Bold</strong> and quite long</p>");
    expect(html(replaceInHtml("<p>A <em>big red</em> dog</p>", "red dog", "blue cat")))
      .toBe("<p>A <em>big </em>blue cat</p>");
  });
  it("F04: deletions, non-breaking spaces, emoji and RTL text", () => {
    expect(html(replaceInHtml("<p>Very very good.</p>", "very ", ""))).toBe("<p>Very good.</p>");
    expect(html(replaceInHtml("<p>Mr. Smith left.</p>", "Mr. Smith", "Dr. Smith"))).toBe("<p>Dr. Smith left.</p>");
    expect(html(replaceInHtml("<p>Hi 👋 there</p>", "👋 there", "👋 friend"))).toBe("<p>Hi 👋 friend</p>");
    expect(html(replaceInHtml("<p>مرحبا بالعالم</p>", "بالعالم", "بكم"))).toBe("<p>مرحبا بكم</p>");
  });
  it("F04: text in scene sections and bare text are both reachable", () => {
    expect(html(replaceInHtml('<section data-segment="a"><p>Teh end.</p></section>', "Teh", "The"))).toBe('<section data-segment="a"><p>The end.</p></section>');
    expect(html(replaceInHtml("Loose teh text", "teh", "the"))).toBe("Loose the text");
  });
});
