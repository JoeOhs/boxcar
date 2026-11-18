import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/schema";
import { clearRecoveryCopy, recoverUnsavedDrafts, saveRecoveryCopy } from "@/lib/draftRecovery";
import { saveChapter } from "@/lib/store";
import { chapter, seedBook } from "./helpers";

// A window closed inside the 600 ms autosave delay must not lose the last words.

beforeEach(() => localStorage.clear());

describe("unsaved typing after a reload or close", () => {
  it("restores a copy the database never received", async () => {
    const { m } = await seedBook();
    const c = await chapter(m, "<p>Before</p>", "chapter", "One");
    await new Promise((r) => setTimeout(r, 5));
    saveRecoveryCopy(c.id, "One", "<p>Before QUICKRELOAD</p>");

    expect(await recoverUnsavedDrafts()).toBe(1);
    const after = await db.chapters.get(c.id);
    expect(after?.content).toBe("<p>Before QUICKRELOAD</p>");
    expect(after?.wordCount).toBe(2);
    expect(localStorage.length).toBe(0);
  });

  it("ignores a copy when the chapter was saved after it", async () => {
    const { m } = await seedBook();
    const c = await chapter(m, "<p>Old</p>");
    saveRecoveryCopy(c.id, "Ch", "<p>Copy</p>");
    await new Promise((r) => setTimeout(r, 5));
    await saveChapter(c.id, { content: "<p>Newer save</p>" });

    expect(await recoverUnsavedDrafts()).toBe(0);
    expect((await db.chapters.get(c.id))?.content).toBe("<p>Newer save</p>");
    expect(localStorage.length).toBe(0);
  });

  it("drops copies for deleted chapters and damaged copies", async () => {
    saveRecoveryCopy("missing-chapter", "T", "<p>x</p>");
    localStorage.setItem("boxcar.unsaved:broken", "{not json");
    localStorage.setItem("boxcar.sidebarCollapsed", "yes");

    expect(await recoverUnsavedDrafts()).toBe(0);
    expect(Object.keys(localStorage)).toEqual(["boxcar.sidebarCollapsed"]);
  });

  it("a completed save clears the copy", async () => {
    saveRecoveryCopy("c1", "T", "<p>x</p>");
    clearRecoveryCopy("c1");
    expect(localStorage.getItem("boxcar.unsaved:c1")).toBeNull();
  });
});
