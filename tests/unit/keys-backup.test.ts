import { describe, expect, it } from "vitest";
import { db, newId, setSetting } from "@/db/schema";
import { addApiKey, deleteApiKey, getAiSettings, getImageAiSettings, migrateLegacyKeys, revokeApiKey, selectApiKey } from "@/lib/keyVault";
import { collectBackup, createBackup, readBackup, restoreBackup, summarizeBackup, summarizeCurrent } from "@/lib/backup";
import { createUniverseNode } from "@/lib/universe";
import { chapter, counts, seedBook } from "./helpers";

const SECRET = "sk-test-SUPERSECRET-1234";

describe("key vault", () => {
  it("encrypts at rest and decrypts round-trip", async () => {
    const row = await addApiKey("text", { provider: "openai", model: "m", apiKey: SECRET });
    const raw = await db.apiKeys.get(row.id);
    expect(JSON.stringify(raw)).not.toContain("SUPERSECRET");
    expect(raw!.tail).toBe("1234");
    expect((await getAiSettings())!.apiKey).toBe(SECRET);
  });
  it("revoke wipes secret but keeps the row; delete removes it and the active pointer", async () => {
    const a = await addApiKey("text", { provider: "openai", model: "m", apiKey: SECRET });
    await revokeApiKey(a.id);
    const r = (await db.apiKeys.get(a.id))!;
    expect([r.status, r.secret, typeof r.revokedAt]).toEqual(["revoked", undefined, "number"]);
    expect(await getAiSettings()).toBeUndefined();
    await selectApiKey(r); // revoked keys cannot be selected
    await deleteApiKey(a.id);
    expect(await db.apiKeys.count()).toBe(0);
    expect(await db.settings.get("activeKey:text")).toBeUndefined();
  });
  it("switching keys; text and image keys are independent; Ollama needs no secret", async () => {
    const a = await addApiKey("text", { provider: "openai", model: "m", apiKey: "sk-aaaa" });
    await addApiKey("text", { provider: "ollama", model: "llama3.2", apiKey: "", baseUrl: "http://localhost:11434" });
    expect((await getAiSettings())!.provider).toBe("ollama");
    await selectApiKey(a);
    expect((await getAiSettings())!.apiKey).toBe("sk-aaaa");
    await addApiKey("image", { provider: "google", model: "g", apiKey: "img-key" });
    expect((await getImageAiSettings())!.apiKey).toBe("img-key");
    expect((await getAiSettings())!.apiKey).toBe("sk-aaaa");
  });
  it("migrateLegacyKeys encrypts old plaintext settings and removes them", async () => {
    await setSetting("ai", { provider: "anthropic", apiKey: SECRET, model: "c" });
    await setSetting("imageAi", { provider: "openai", apiKey: "img-SECRET", model: "i" });
    await migrateLegacyKeys();
    expect(await db.settings.get("ai")).toBeUndefined();
    expect(await db.settings.get("imageAi")).toBeUndefined();
    expect((await getAiSettings())!.apiKey).toBe(SECRET);
    expect(JSON.stringify(await db.apiKeys.toArray())).not.toContain("SECRET");
  });
});

describe("backup", () => {
  it("excludes apiKeys and vault settings", async () => {
    await addApiKey("text", { provider: "openai", model: "m", apiKey: SECRET });
    const b = await collectBackup();
    expect(b.tables.apiKeys).toBeUndefined();
    expect(b.tables.settings.map((s) => s.key)).toEqual([]);
    expect(await (await createBackup()).blob.text()).not.toContain("SUPERSECRET");
  });
  it("F06: an unmigrated plaintext key in settings is kept out of the backup", async () => {
    await setSetting("ai", { provider: "openai", apiKey: SECRET, model: "m" });
    expect(await (await createBackup()).blob.text()).not.toContain("SUPERSECRET");
  });
  it("round trip create -> wipe -> restore keeps row counts and Blobs", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>Ünïcødé 👋 مرحبا</p>");
    await db.manuscripts.update(m.id, { cover: new Blob([new Uint8Array([1, 2, 3, 255])], { type: "image/png" }) });
    await db.coverConcepts.add({ id: newId(), manuscriptId: m.id, prompt: "p", provider: "openai", model: "x", image: new Blob(["png!"], { type: "image/png" }), createdAt: 1 });
    await createUniverseNode(m.id, "character");
    const before = await counts();
    const { blob } = await createBackup();
    const file = new File([await blob.text()], "b.json");
    await Promise.all(db.tables.map((t) => t.clear()));
    await restoreBackup(await readBackup(file));
    expect(await counts()).toEqual(before);
    const cover = (await db.manuscripts.get(m.id))!.cover!;
    expect([cover.type, [...new Uint8Array(await cover.arrayBuffer())]]).toEqual(["image/png", [1, 2, 3, 255]]);
    expect((await db.chapters.toArray())[0].content).toContain("👋 مرحبا");
  });
  it.each([["not json", "{"], ["wrong app", '{"app":"x","version":1,"tables":{}}'], ["bad tables", '{"app":"boxcar-studio","version":1,"tables":{"a":5}}']])(
    "readBackup rejects %s", async (_n, text) => {
      await expect(readBackup(new File([text], "x.json"))).rejects.toThrow(/not a boxcar backup/);
    });
  it("readBackup rejects newer versions", async () => {
    await expect(readBackup(new File(['{"app":"boxcar-studio","version":99,"tables":{}}'], "x"))).rejects.toThrow(/newer version/);
  });
  it("a restore that fails midway leaves the existing data untouched (atomic)", async () => {
    const { m } = await seedBook();
    await chapter(m, "<p>keep me</p>");
    const before = await counts();
    const bad = { app: "boxcar-studio" as const, version: 1, savedAt: 1, tables: { workspaces: [{ id: "w", name: "x" }], chapters: [{ notAnId: true }] } };
    await expect(restoreBackup(bad)).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });
  it("restore keeps this computer's API keys", async () => {
    await addApiKey("text", { provider: "openai", model: "m", apiKey: SECRET });
    const b = await collectBackup();
    await restoreBackup(b);
    expect((await getAiSettings())!.apiKey).toBe(SECRET);
  });
  it("F07: a pre-v7 backup's storyEntries are moved into the Universe on restore", async () => {
    const b = { app: "boxcar-studio" as const, version: 1, savedAt: 1, tables: { storyEntries: [{ id: "s", manuscriptId: "m", kind: "character", name: "Ana", description: "", createdAt: 1, updatedAt: 1 }] } };
    await restoreBackup(b);
    expect(await db.universeNodes.count()).toBe(1);
    expect((await db.universeNodes.get("s"))!.name).toBe("Ana");
  });
  it("F07: a v7+ backup does not bring back a Universe node the author deleted", async () => {
    const entry = { id: "s", manuscriptId: "m", kind: "character", name: "Ana", description: "", createdAt: 1, updatedAt: 1 };
    await restoreBackup({ app: "boxcar-studio", version: 1, savedAt: 1, tables: { storyEntries: [entry], universeNodes: [] } });
    expect(await db.universeNodes.count()).toBe(0);
  });
  it.fails("BUG-summary-mismatch: summarizeBackup counts settings rows but summarizeCurrent does not", async () => {
    await setSetting("theme", "light");
    const b = summarizeBackup(await collectBackup());
    const cur = await summarizeCurrent();
    expect(b.otherRows).toBe(cur.otherRows);
  });
});
