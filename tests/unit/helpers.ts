import { vi } from "vitest";
import { db, type Chapter, type Manuscript } from "@/db/schema";
import { createChapter, createManuscript, createWorkspace } from "@/lib/store";

export async function seedBook(title = "Book") {
  const ws = await createWorkspace("Pen Name");
  const m = await createManuscript(ws, title);
  return { ws, m };
}

export async function chapter(m: Manuscript, html: string, kind: Chapter["kind"] = "chapter", title = "Ch") {
  return createChapter(m.id, kind, title, html);
}

export interface Call { url: string; init: RequestInit; body: any }

/** Replaces fetch with a queue of canned responses and records each call. */
export function mockFetch(...responses: (Response | Error | ((c: Call) => Response | Promise<Response>))[]) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    const call = { url: String(url), init, body: init.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(call) : next.clone();
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export const openAiReply = (content: string) => json({ choices: [{ message: { content } }] });

export async function counts() {
  const out: Record<string, number> = {};
  for (const t of db.tables) out[t.name] = await t.count();
  return out;
}
