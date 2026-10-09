import { useLiveQuery } from "dexie-react-hooks";
import { getAiSettings, type AgentRole, type AiProvider, type AiSettings } from "@/db/schema";

export const AGENT_LABEL: Record<AgentRole, string> = {
  outliner: "Outliner",
  editor: "Editor",
  proofreader: "Proofreader",
  formatter: "Formatter",
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
};

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: "gpt-4o",
  anthropic: "claude-sonnet-4-5",
};

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

/** The author's AI settings. undefined while loading, null when no key has been saved. */
export function useAiSettings(): AiSettings | null | undefined {
  return useLiveQuery(async () => {
    const settings = await getAiSettings();
    return settings && settings.apiKey.trim() ? settings : null;
  }, []);
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

/** Sends a conversation to the author's chosen provider and returns the reply text. */
export async function askAi(settings: AiSettings, system: string, turns: ChatTurn[]): Promise<string> {
  if (!navigator.onLine) {
    throw new Error("You are offline. The AI staff need a connection; everything else keeps working.");
  }
  if (!settings.apiKey.trim()) {
    throw new Error("Add your AI key in Settings first.");
  }

  let response: Response;
  try {
    if (settings.provider === "openai") {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [{ role: "system", content: system }, ...turns],
        }),
      });
    } else {
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
    }
  } catch {
    throw new Error("Could not reach the AI provider. Check your connection and try again.");
  }

  if (settings.provider === "openai") {
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

/** System prompt for a role, with optional manuscript context appended. */
export function systemPrompt(role: AgentRole, context: string): string {
  return context.trim()
    ? `${ROLE_PROMPT[role]}\n\nHere is the current state of the author's manuscript:\n${context}`
    : ROLE_PROMPT[role];
}

export interface ProposedEdit {
  original: string;
  replacement: string;
  comment: string;
}

/** Asks the editor or proofreader for concrete edits to one chapter. */
export async function requestEdits(
  settings: AiSettings,
  role: "editor" | "proofreader",
  chapterText: string,
): Promise<ProposedEdit[]> {
  const task =
    role === "proofreader"
      ? "Proofread the chapter below. Find real spelling, grammar and punctuation mistakes."
      : "Edit the chapter below. Find places where the prose can be clearer, tighter or more vivid.";
  const instructions =
    `${task}\n\nReply with ONLY a JSON array (no prose, no code fences) of at most 12 objects with the keys ` +
    `"original", "replacement" and "comment". "original" must be copied exactly, character for character, ` +
    `from one single paragraph of the chapter and be long enough to be unique. "replacement" is the corrected text. ` +
    `"comment" is a short reason. Reply with [] if nothing needs changing.\n\nCHAPTER:\n${chapterText.slice(0, 24000)}`;

  const reply = await askAi(settings, ROLE_PROMPT[role], [{ role: "user", content: instructions }]);
  const start = reply.indexOf("[");
  const end = reply.lastIndexOf("]");
  if (start === -1 || end <= start) throw new Error("The AI reply was not in the expected format. Try again.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error("The AI reply was not in the expected format. Try again.");
  }
  if (!Array.isArray(parsed)) throw new Error("The AI reply was not in the expected format. Try again.");

  const edits: ProposedEdit[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { original, replacement, comment } = entry as Record<string, unknown>;
    if (typeof original === "string" && original && typeof replacement === "string" && original !== replacement) {
      edits.push({ original, replacement, comment: typeof comment === "string" ? comment : "" });
    }
  }
  return edits;
}
