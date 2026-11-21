import { describe, expect, it } from "vitest";
import { db, newId, type Id } from "@/db/schema";
import { bookStorage, clearBookChats, clearCoverConcepts, formatBytes, trimRevisions } from "@/lib/storage";
import { chapter, seedBook } from "./helpers";

// F14: storage is shown per book, and only cleared when the author asks.

async function addRevisions(manuscriptId: Id, chapterId: Id, n: number) {
  await db.revisions.bulkAdd(
    Array.from({ length: n }, (_, i) => ({
      id: newId(), chapterId, manuscriptId, label: `r${i}`, title: "T", content: "abcd", wordCount: 1, createdAt: 1000 + i,
    })),
  );
}

describe("F14: storage use per book", () => {
  it("counts and sizes revisions, chat messages and cover concepts", async () => {
    const { m } = await seedBook();
    const c = await chapter(m, "<p>x</p>");
    await addRevisions(m.id, c.id, 3);
    await db.agentMessages.add({ id: newId(), manuscriptId: m.id, role: "editor" as never, from: "user", text: "hello", createdAt: 1 });
    await db.coverConcepts.add({ id: newId(), manuscriptId: m.id, prompt: "p", provider: "openai", model: "x", image: new Blob(["12345678"]), createdAt: 1 });

    const s = await bookStorage(m.id);
    expect(s.revisions).toEqual({ count: 3, bytes: 3 * (4 + 1) * 2 });
    expect(s.messages).toEqual({ count: 1, bytes: 10 });
    expect(s.covers).toEqual({ count: 1, bytes: 8 + 2 });
    expect(s.totalBytes).toBe(30 + 10 + 10);
  });

  it("trimRevisions keeps the newest N of each chapter and touches no other book", async () => {
    const { m } = await seedBook();
    const a = await chapter(m, "<p>a</p>");
    const b = await chapter(m, "<p>b</p>");
    await addRevisions(m.id, a.id, 15);
    await addRevisions(m.id, b.id, 4);
    const other = await seedBook("Other");
    const oc = await chapter(other.m, "<p>o</p>");
    await addRevisions(other.m.id, oc.id, 15);

    expect(await trimRevisions(m.id, 10)).toBe(5);
    const left = await db.revisions.where("chapterId").equals(a.id).toArray();
    expect(left.map((r) => r.label).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `r${i + 5}`).sort());
    expect(await db.revisions.where("chapterId").equals(b.id).count()).toBe(4);
    expect(await db.revisions.where("manuscriptId").equals(other.m.id).count()).toBe(15);
  });

  it("clearing chats and concepts keeps the chosen cover and the chapters", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>keep me</p>");
    const cover = new Blob(["cover"]);
    await db.manuscripts.update(m.id, { cover });
    await db.coverConcepts.add({ id: newId(), manuscriptId: m.id, prompt: "p", provider: "openai", model: "x", image: cover, createdAt: 1 });
    await db.agentMessages.add({ id: newId(), manuscriptId: m.id, role: "editor" as never, from: "agent", text: "hi", createdAt: 1 });

    expect(await clearCoverConcepts(m.id)).toBe(1);
    expect(await clearBookChats(m.id)).toBe(1);
    expect((await db.manuscripts.get(m.id))!.cover?.size).toBe(5);
    expect(await db.chapters.where("manuscriptId").equals(m.id).count()).toBe(1);
  });

  it("formats sizes for people", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(820 * 1024)).toBe("820 KB");
    expect(formatBytes(1.4 * 1024 * 1024)).toBe("1.4 MB");
  });
});
