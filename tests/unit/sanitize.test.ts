import { describe, expect, it } from "vitest";
import { isSafeUrl, sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml (F02)", () => {
  it("removes scripts, handlers, styles and dangerous elements", () => {
    const out = sanitizeHtml('<p style="color:red" onclick="x()">Hi<script>alert(1)</script><iframe src="https://e.com"></iframe><svg onload="x()"></svg></p>');
    expect(out).toBe("<p>Hi</p>");
  });
  it.each(["javascript:alert(1)", " JaVaScRiPt:alert(1)", "java\nscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)"])(
    "rejects %j", (url) => {
      expect(isSafeUrl(url)).toBe(false);
    });
  it.each(["https://example.com/page", "http://example.com", "mailto:author@example.com", "#note-3"])("keeps %j", (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });
  it("keeps the link text when the address is dropped", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">Click</a>')).toBe("<a>Click</a>");
  });
});
