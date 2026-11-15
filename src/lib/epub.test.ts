import { describe, expect, it } from "vitest";
import { toXhtmlBody } from "./epub";

describe("toXhtmlBody", () => {
  it("turns horizontal rules into scene-break paragraphs with the chosen ornament", () => {
    expect(toXhtmlBody("<p>One.</p><hr><p>Two.</p>", "* * *")).toContain('<p class="scenebreak">* * *</p>');
  });

  it("removes scripts, inline styles and event handlers", () => {
    const out = toXhtmlBody(
      '<p style="color:red" onclick="steal()">Hi</p><script>alert(1)</script><style>p{}</style>',
      "#",
    );
    expect(out).not.toMatch(/script|style=|onclick|alert/);
    expect(out).toContain("Hi");
  });

  it("unwraps writing scenes so their text runs on in the book", () => {
    const out = toXhtmlBody('<section data-segment="1"><p>Scene text.</p></section>', "#");
    expect(out).not.toContain("<section");
    expect(out).toContain("Scene text.");
  });

  it("converts editor divs into paragraphs", () => {
    const out = toXhtmlBody("<div>Line</div>", "#");
    expect(out).toMatch(/^<p[^>]*>Line<\/p>$/);
  });

  it("drops empty paragraphs left behind by the editor", () => {
    expect(toXhtmlBody("<p>Text</p><p> </p><p><br></p>", "#")).not.toMatch(/<p[^>]*>\s*(<br[^>]*>)?\s*<\/p>/);
  });

  it("returns an empty string for an empty chapter", () => {
    expect(toXhtmlBody("", "#")).toBe("");
    expect(toXhtmlBody("<p>  </p>", "#")).toBe("");
  });

  // EPUB readers and stores reject chapters that are not well-formed XHTML.
  it("produces well-formed XHTML from messy editor HTML", () => {
    const messy =
      "<p>Fish &amp; chips<br>line two</p>" + // <br> with no closing slash
      "<p>Unclosed <em>italics</p>" + // tag never closed
      "<p>Smart “quotes” &nbsp;and a bare & sign</p>" + // pasted typography
      '<span style="font-family:Calibri">Pasted from Word</span>' + // stray Word styling
      "<img src=cover.jpg>"; // image tag with no closing slash
    const out = toXhtmlBody(messy, "* * *");
    const wrapped = `<div xmlns="http://www.w3.org/1999/xhtml">${out}</div>`;
    const doc = new DOMParser().parseFromString(wrapped, "application/xhtml+xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  });
});
