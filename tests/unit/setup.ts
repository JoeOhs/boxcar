import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, vi } from "vitest";

// jsdom's Blob cannot be structured-cloned by fake-indexeddb and lacks arrayBuffer();
// use Node's Blob, which behaves like the browser's.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
globalThis.File = NodeFile as unknown as typeof File;
// Minimal FileReader over Node's Blob (only what src/ uses: readAsDataURL, readAsArrayBuffer, readAsText).
class TestFileReader {
  result: string | ArrayBuffer | null = null;
  onload: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private run(blob: Blob, map: (buf: ArrayBuffer) => string | ArrayBuffer) {
    blob.arrayBuffer().then(
      (buf) => { this.result = map(buf); this.onload?.({ target: this }); },
      (err) => this.onerror?.(err),
    );
  }
  readAsDataURL(blob: Blob) { this.run(blob, (b) => `data:${blob.type};base64,${Buffer.from(b).toString("base64")}`); }
  readAsArrayBuffer(blob: Blob) { this.run(blob, (b) => b); }
  readAsText(blob: Blob) { this.run(blob, (b) => Buffer.from(b).toString("utf8")); }
}
globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto });

beforeEach(async () => {
  const { db } = await import("@/db/schema");
  if (!db.isOpen()) await db.open();
  await Promise.all(db.tables.map((t) => t.clear()));
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
