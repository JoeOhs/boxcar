import { describe, expect, it } from "vitest";
import { countWords, diffParagraphs, escapeHtml, htmlToText, replaceInHtml, textToParagraphs } from "@/lib/text";

describe("escapeHtml", () => {
  it("escapes every character that is special in HTML and XML", () => {
    expect(escapeHtml(`Tom & "Jerry" <it's>`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;it&#39;s&gt;");
  });
});

describe("htmlToText", () => {
  it("puts a line break between paragraphs and turns rules into scene breaks", () => {
    const text = htmlToText("<p>One.</p><hr><p>Two.</p>");
    expect(textToParagraphs(text)).toEqual(["One.", "* * *", "Two."]);
  });

  it("turns non-breaking spaces into ordinary spaces", () => {
    expect(htmlToText("<p>a&nbsp;b</p>")).toBe("a b");
  });
});

describe("countWords", () => {
  it("counts words across paragraphs and inline formatting", () => {
    expect(countWords("<p>The <em>quick</em> brown</p><p>fox jumps.</p>")).toBe(5);
  });

  it("does not glue words together at paragraph boundaries", () => {
    expect(countWords("<p>end</p><p>start</p>")).toBe(2);
  });

  it("returns 0 for empty or whitespace-only chapters", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("<p>   </p><p><br></p>")).toBe(0);
  });
});

describe("textToParagraphs", () => {
  it("splits on line breaks, trims, and drops blank lines", () => {
    expect(textToParagraphs("  First  \n\n\nSecond\n ")).toEqual(["First", "Second"]);
  });
});

describe("replaceInHtml", () => {
  it("replaces inside a single text node and keeps surrounding formatting", () => {
    const out = replaceInHtml("<p>She <strong>ran</strong> fast.</p>", "ran", "sprinted");
    expect(out).toEqual({ ok: true, html: "<p>She <strong>sprinted</strong> fast.</p>" });
  });

  it("refuses to guess when the passage appears more than once (F04)", () => {
    expect(replaceInHtml("<p>cat cat</p>", "cat", "dog")).toEqual({ ok: false, reason: "ambiguous" });
  });

  it("replaces a passage that spans formatting without touching other paragraphs", () => {
    const out = replaceInHtml("<p>a <em>very</em> long day</p><p>untouched <b>bold</b></p>", "a very long", "one short");
    expect(out.ok && out.html).toContain("<p>untouched <b>bold</b></p>");
    expect(out.ok && out.html).toContain("one short");
    expect(out.ok && out.html).toContain(" day</p>");
  });

  it("reports a missing or empty passage", () => {
    expect(replaceInHtml("<p>hello</p>", "goodbye", "x")).toEqual({ ok: false, reason: "missing" });
    expect(replaceInHtml("<p>hello</p>", "", "x")).toEqual({ ok: false, reason: "missing" });
  });

  it("treats replacement text as text, not markup", () => {
    expect(replaceInHtml("<p>hi</p>", "hi", "<script>")).toEqual({ ok: true, html: "<p>&lt;script&gt;</p>" });
  });
});

describe("diffParagraphs", () => {
  it("marks unchanged, removed and added paragraphs in order", () => {
    expect(diffParagraphs(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "b" },
      { type: "added", text: "x" },
      { type: "same", text: "c" },
    ]);
  });

  it("handles empty sides", () => {
    expect(diffParagraphs([], ["a"])).toEqual([{ type: "added", text: "a" }]);
    expect(diffParagraphs(["a"], [])).toEqual([{ type: "removed", text: "a" }]);
  });
});
