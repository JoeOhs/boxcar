import { describe, expect, it } from "vitest";
import { db } from "@/db/schema";
import { corkNoteToUniverseNode, createCorkNote, deleteCorkNote, nextNotePosition, patchCorkNote } from "@/lib/corkboard";
import { seedBook } from "./helpers";

describe("Cork board", () => {
  it("a reply sent to the Universe is pinned as a yellow note naming its AI role", async () => {
    const { m } = await seedBook();
    const note = await createCorkNote(m.id, "Respect is the destination.", "dev-editor");
    const stored = await db.corkNotes.get(note.id);
    expect(stored).toMatchObject({ manuscriptId: m.id, text: "Respect is the destination.", fromRole: "dev-editor", color: "yellow" });
  });

  it("new notes are laid out in rows instead of stacking on one spot", async () => {
    const { m } = await seedBook();
    const a = await createCorkNote(m.id, "one");
    const b = await createCorkNote(m.id, "two");
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
    expect(nextNotePosition(4).y).toBeGreaterThan(nextNotePosition(0).y);
  });

  it("notes are moved, rewritten and taken down", async () => {
    const { m } = await seedBook();
    const note = await createCorkNote(m.id, "draft");
    await patchCorkNote(note.id, { x: 300, y: 120, text: "final", color: "blue" });
    expect(await db.corkNotes.get(note.id)).toMatchObject({ x: 300, y: 120, text: "final", color: "blue" });
    await deleteCorkNote(note.id);
    expect(await db.corkNotes.get(note.id)).toBeUndefined();
  });

  it("a note becomes a Universe concept named by its first line, and stays on the board", async () => {
    const { m } = await seedBook();
    const note = await createCorkNote(m.id, "**Respect** is the destination\nLove is the road there.", "dev-editor");
    const nodeId = await corkNoteToUniverseNode(note);
    const node = await db.universeNodes.get(nodeId);
    expect(node).toMatchObject({ manuscriptId: m.id, kind: "concept", name: "Respect is the destination" });
    expect(node?.summary).toContain("Love is the road there.");
    expect(await db.corkNotes.get(note.id)).toBeDefined();
  });
});
