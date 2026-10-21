import { useLiveQuery } from "dexie-react-hooks";
import { type AgentRole, type AiSettings, type EditStage, type SuggestionKind } from "@/db/schema";
import { stageInfo } from "./editing";
import { providerNeedsKey, normalizeServerUrl } from "./providers";
import { getAiSettings } from "./keyVault";
import { FORMAT_PRESETS, presetById, type FormatPreset } from "./formatPresets";

export const AGENT_LABEL: Record<AgentRole, string> = {
  outliner: "Outliner",
  editor: "Editor",
  proofreader: "Proofreader",
  formatter: "Formatter",
  ghostwriter: "Ghostwriter",
};

const ROLE_PROMPT: Record<AgentRole, string> = {
  outliner:
    "You are the Outliner at a small publishing house. You help an author build the structure of a book: acts, chapters, scenes and beats. Be concrete, ask a short question when the idea is unclear, and keep answers brief and well organised.",
  editor:
    "You are the developmental and line Editor at a small publishing house. You give the author honest, specific feedback on pacing, voice, clarity and continuity, and you respect the author's style.",
  proofreader:
    "You are the Proofreader at a small publishing house. You find spelling, grammar, punctuation and consistency errors and change as little as possible.",
  formatter:
    "You are the Formatter at a small publishing house. You advise on how an ebook for Amazon KDP should look: fonts, spacing, headings, scene breaks, drop caps and table of contents. Give concrete recommendations.",
  ghostwriter:
    "You are the Ghostwriter at a small publishing house. You write prose for the author, in the author's own voice: continuing scenes, drafting new ones, writing dialogue and description, and rewriting passages on request. Match the voice, tense, point of view and style of the text you are shown, and keep to the facts of the story so far. When asked for prose, give the prose itself, ready to paste into the manuscript, with no preamble. The author has the final say on every word.",
};

/** The author's AI settings. undefined while loading, null when no key has been saved. */
export function useAiSettings(): AiSettings | null | undefined {
  return useLiveQuery(async () => {
    const settings = await getAiSettings();
    return settings && (settings.apiKey.trim() || !providerNeedsKey(settings.provider)) ? settings : null;
  }, []);
}

/** True when the AI can be asked now: online, or running on this computer (Ollama), which needs no connection. */
export function aiReachable(settings: AiSettings | null | undefined, online: boolean): boolean {
  return online || settings?.provider === "ollama";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ApiErrorBody {
  error?: { message?: string } | string;
}

interface OpenAiBody extends ApiErrorBody {
  choices?: { message?: { content?: string | null } }[];
}

interface AnthropicBody extends ApiErrorBody {
  content?: { type: string; text?: string }[];
}

function errorText(body: ApiErrorBody | null, status: number, statusText: string): string {
  const err = body?.error;
  const message = typeof err === "string" ? err : err?.message;
  return message ? `${message}` : `The AI provider answered ${status} ${statusText}`.trim();
}

/** Chat endpoints of the providers that speak the OpenAI chat format. */
const HUGGING_FACE_CHAT_URL = "https://router.huggingface.co/v1/chat/completions";

function openAiStyleEndpoint(settings: AiSettings): { url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.provider === "ollama") {
    // Ollama answers the OpenAI chat format on its own address and takes no key.
    return { url: `${normalizeServerUrl(settings.baseUrl ?? "")}/v1/chat/completions`, headers };
  }
  headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  return {
    url: settings.provider === "huggingface" ? HUGGING_FACE_CHAT_URL : "https://api.openai.com/v1/chat/completions",
    headers,
  };
}

/** Sends a conversation to the author's chosen provider and returns the reply text. */
export async function askAi(settings: AiSettings, system: string, turns: ChatTurn[]): Promise<string> {
  const local = settings.provider === "ollama";
  if (!local && !navigator.onLine) {
    throw new Error("You are offline. The AI staff need a connection; everything else keeps working.");
  }
  if (providerNeedsKey(settings.provider) && !settings.apiKey.trim()) {
    throw new Error("Add your AI key in Settings first.");
  }

  let response: Response;
  try {
    if (settings.provider === "anthropic") {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 4096,
          system,
          messages: turns,
        }),
      });
    } else {
      const { url, headers } = openAiStyleEndpoint(settings);
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "system", content: system }, ...turns],
        }),
      });
    }
  } catch {
    throw new Error(
      local
        ? `Could not reach Ollama at ${normalizeServerUrl(settings.baseUrl ?? "")}. Check that Ollama is running and that it allows this app (set OLLAMA_ORIGINS).`
        : "Could not reach the AI provider. Check your connection and try again.",
    );
  }

  if (settings.provider !== "anthropic") {
    const body = (await response.json().catch(() => null)) as OpenAiBody | null;
    if (!response.ok) throw new Error(errorText(body, response.status, response.statusText));
    const text = body?.choices?.[0]?.message?.content;
    if (!text) throw new Error("The AI provider sent back an empty reply.");
    return text.trim();
  }

  const body = (await response.json().catch(() => null)) as AnthropicBody | null;
  if (!response.ok) throw new Error(errorText(body, response.status, response.statusText));
  const text = (body?.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");
  if (!text) throw new Error("The AI provider sent back an empty reply.");
  return text.trim();
}
/** System prompt for a role, with optional manuscript context appended. `persona` replaces the role's usual brief. */
export function systemPrompt(role: AgentRole, context: string, persona?: string): string {
  const brief = persona ?? ROLE_PROMPT[role];
  return context.trim() ? `${brief}\n\nHere is the current state of the author's manuscript:\n${context}` : brief;
}

export interface ProposedEdit {
  kind: SuggestionKind;
  /** The passage concerned, copied from the chapter. May be empty for a note on the whole chapter. */
  original: string;
  replacement: string;
  comment: string;
}

/** Finds the JSON in an AI reply (which may be wrapped in prose or code fences) and parses it. */
export function parseJson(reply: string, open: "[" | "{"): unknown {
  const close = open === "[" ? "]" : "}";
  const start = reply.indexOf(open);
  const end = reply.lastIndexOf(close);
  if (start === -1 || end <= start) throw new Error("The AI reply was not in the expected format. Try again.");
  try {
    return JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error("The AI reply was not in the expected format. Try again.");
  }
}

/**
 * Asks the AI for one editing pass over one chapter. The developmental pass
 * returns notes about the story; line, copy and proofreading passes return
 * exact text changes the author can accept.
 */
export async function requestStageReview(
  settings: AiSettings,
  stage: EditStage,
  chapterText: string,
  bookContext: string,
  styleGuide: string,
  /** Replaces the pass's usual persona, e.g. the copy-editing style agent that was chosen. */
  persona?: string,
): Promise<ProposedEdit[]> {
  const info = stageInfo(stage);
  const guide =
    stage === "copy"
      ? `\n\nStyle guide to follow: ${styleGuide.trim() || "none was chosen, so use the standard conventions of the book's language and keep everything consistent."}`
      : "";
  const context = bookContext.trim() ? `\n\nTHE BOOK SO FAR:\n${bookContext.slice(0, 8000)}` : "";
  const format =
    info.output === "notes"
      ? `Reply with ONLY a JSON array (no prose, no code fences) of at most 8 objects with the keys "passage" and "comment". ` +
        `"passage" is a short quote copied exactly, character for character, from one paragraph of the chapter that the note is about, or "" when it concerns the whole chapter. ` +
        `"comment" is the note: what the problem is and how the author could fix it. Reply with [] if there is nothing to raise.`
      : `Reply with ONLY a JSON array (no prose, no code fences) of at most 12 objects with the keys ` +
        `"original", "replacement" and "comment". "original" must be copied exactly, character for character, ` +
        `from one single paragraph of the chapter and be long enough to be unique. "replacement" is the corrected text. ` +
        `"comment" is a short reason. Reply with [] if nothing needs changing.`;
  const prompt = `${info.task}${guide}\n\n${format}${context}\n\nCHAPTER:\n${chapterText.slice(0, 24000)}`;

  const reply = await askAi(settings, persona ?? info.persona, [{ role: "user", content: prompt }]);
  const parsed = parseJson(reply, "[");
  if (!Array.isArray(parsed)) throw new Error("The AI reply was not in the expected format. Try again.");

  const edits: ProposedEdit[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { original, replacement, passage, comment } = entry as Record<string, unknown>;
    const why = typeof comment === "string" ? comment.trim() : "";
    if (info.output === "notes") {
      if (why) edits.push({ kind: "note", original: typeof passage === "string" ? passage : "", replacement: "", comment: why });
    } else if (typeof original === "string" && original && typeof replacement === "string" && original !== replacement) {
      edits.push({ kind: "change", original, replacement, comment: why });
    }
  }
  return edits;
}

export interface PresetChoice {
  preset: FormatPreset;
  /** Why the AI chose it, in the AI's words. */
  reason: string;
}

/** What the formatter is told about the book when it picks a preset. */
export interface BookProfile {
  title: string;
  subtitle: string;
  description: string;
  keywords: string[];
  wordCount: number;
  chapterCount: number;
  /** The start of the first chapter, so the AI can judge the voice. */
  sample: string;
}

/** Asks the Formatter to pick the preset that suits the book best. */
export async function requestFormatPreset(settings: AiSettings, book: BookProfile): Promise<PresetChoice> {
  const list = FORMAT_PRESETS.map((p) => `- ${p.id}: ${p.label}. ${p.description}`).join("\n");
  const prompt =
    `Choose the formatting preset that suits this book best for an Amazon KDP ebook.\n\nPRESETS:\n${list}\n\n` +
    `THE BOOK:\nTitle: ${book.title}${book.subtitle ? `\nSubtitle: ${book.subtitle}` : ""}\n` +
    `Description: ${book.description || "(none written yet)"}\nKeywords: ${book.keywords.join(", ") || "(none)"}\n` +
    `Length: ${book.wordCount} words in ${book.chapterCount} chapters\n` +
    `Opening of the first chapter:\n${book.sample.slice(0, 1500) || "(nothing written yet)"}\n\n` +
    `Reply with ONLY a JSON object (no prose, no code fences) like {"preset": "<one of the preset ids above>", "reason": "<one or two sentences>"}.`;

  const reply = await askAi(settings, ROLE_PROMPT.formatter, [{ role: "user", content: prompt }]);
  const parsed = parseJson(reply, "{") as { preset?: unknown; reason?: unknown } | null;
  const preset = typeof parsed?.preset === "string" ? presetById(parsed.preset.trim()) : undefined;
  if (!preset) throw new Error("The AI did not name one of the presets. Try again.");
  return { preset, reason: typeof parsed?.reason === "string" ? parsed.reason.trim() : "" };
}