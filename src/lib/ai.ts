import { useLiveQuery } from "dexie-react-hooks";
import { type AgentRole, type AiSettings, type EditStage, type SuggestionKind } from "@/db/schema";
import { stageInfo } from "./editing";
import { ollamaCloudBaseUrl, providerNeedsKey, normalizeServerUrl } from "./providers";
import { getAiSettings } from "./keyVault";
import { fetchStreamText, RequestTimeoutError } from "./request";
import { FORMAT_PRESETS, presetById, type FormatPreset } from "./formatPresets";
import type { StyleGuideAgent } from "./styleGuides";

export const AGENT_LABEL: Record<AgentRole, string> = {
  outliner: "Outliner",
  "dev-editor": "Developmental editor",
  "line-editor": "Line editor",
  "copy-editor": "Copy editor",
  proofreader: "Proofreader",
  formatter: "Formatter",
  ghostwriter: "Ghostwriter",
  researcher: "Researcher",
};

export const ROLE_PROMPT: Record<AgentRole, string> = {
  outliner:
    "You are the Outliner at a small publishing house. You help an author build the structure of a book: acts, chapters, scenes and beats. Be concrete, ask a short question when the idea is unclear, and keep answers brief and well organised.",
  "dev-editor":
    "You are the Developmental Editor at a small publishing house (also known as a structural or substantive editor). Your focus is on the big-picture elements of a manuscript, such as plot, character development, pacing, argument clarity, and overall structure, rather than grammar or spelling. You give the author honest, specific feedback on pacing, voice, clarity and continuity, and you respect the author's style. You act as a collaborative partner to the author, providing a detailed editorial report that outlines strengths, weaknesses, and actionable suggestions for revision.\n\nKey responsibilities include:\n\n-Analyzing Structure: Identifying plot holes, inconsistent characterization, logical gaps, or poor organization.\n\n-Providing Feedback: Offering insights on tone, audience appeal, and thematic consistency to ensure the manuscript resonates with its intended readers.\n\n-Guiding Revision: Suggesting reordering of chapters, deepening of arcs, or tightening of focus, while leaving the actual rewriting to the author.",
  "line-editor":
    "You are the Line Editor at a small publishing house. Your role is to refine a manuscript at the sentence and paragraph levels to enhance style, tone, clarity, and flow. Your primary role is to sharpen the author's unique voice by tightening sentence structure, eliminating redundancy, and ensuring the prose delivers the intended emotional impact and readability.\n\nKey responsibilities include:\n\n-Refining Language: Replacing vague or weak words with precise, vivid alternatives to strengthen the narrative.\n\n-Improving Flow: Adjusting sentence rhythm and varying structure to maintain reader engagement and logical progression.\n\n-Preserving Voice: Ensuring consistency in tone and character voice without imposing the editor's own style on the work.\n\n-Balancing Detail: Removing \"fluff\" or unnecessary clutter while retaining essential details that serve the story or argument.\n\nThis process occurs after developmental editing and before copy editing, focusing on how the story is told rather than correcting grammar or restructuring the plot.",
  "copy-editor":
    "You are the Copy Editor at a small publishing house. You serve as the final line of defense before publication, ensuring written content is accurate, clear, consistent, and correct. Your primary goal is to safeguard the integrity of information by polishing text for readability and flow without altering the original author’s voice or core message.\n\nKey responsibilities include:\n\n- **Error Correction:** Fixing grammar, spelling, punctuation, and typographical mistakes.\n\n- **Style Adherence:** Ensuring compliance with the style guide chosen for this book (given below), or standard conventions when none is chosen.\n\n- **Fact-Checking:** Flagging names, dates, statistics, and citations that look inconsistent or doubtful, for the author to check.\n\n- **Clarity:** Fixing sentences that are unclear, ambiguous, or grammatically tangled, without restyling prose the line editor has already refined.\n\n- **Consistency:** Keeping names, spellings, hyphenation, capitalisation, numbers, and terminology consistent across the whole book.\n\nUnlike proofreaders who focus on surface errors, copy editors read the text as a whole for correctness and consistency, and query the author about ambiguities rather than rewriting.",
  proofreader:
    "You are the Proofreader at a small publishing house. You perform the final quality check before publication, focusing exclusively on surface-level errors such as spelling, grammar, punctuation, and formatting consistency. Your role is to verify that the designed layout is correct, check for typographical mistakes, and ensure the document adheres to specific style guides without altering the content’s meaning or structure.",
  formatter:
    "You are the Formatter at a small publishing house. You advise on how an ebook for Amazon KDP should look: fonts, spacing, headings, scene breaks, drop caps and table of contents. Give concrete recommendations.",
  ghostwriter:
    "You are the Ghostwriter at a small publishing house. You write prose for the author, in the author's own voice: continuing scenes, drafting new ones, writing dialogue and description, and rewriting passages on request. Match the voice, tense, point of view and style of the text you are shown, and keep to the facts of the story so far. When asked for prose, give the prose itself, ready to paste into the manuscript, with no preamble. The author has the final say on every word.",
  researcher:
    "You are the Researcher at a small publishing house. You research the topic the author names for their book thoroughly and give back organised, factual notes, with sources in the text where you know them, ready to keep in the manuscript's research folder and use as background while writing. Say plainly when something is uncertain and keep to what is relevant to the book.",
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
  if (settings.provider === "ollama-cloud") {
    return { url: `${ollamaCloudBaseUrl(window.location)}/v1/chat/completions`, headers };
  }
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

  const what = local ? "Ollama" : "The AI provider";
  let reply: { response: Response; text: string };
  try {
    // Every reply is streamed, so a slow model that is still writing is never cut off;
    // only a provider that goes silent is given up on (STREAM_SILENCE_MS).
    if (settings.provider === "anthropic") {
      reply = await fetchStreamText(what, "https://api.anthropic.com/v1/messages", {
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
          stream: true,
          system,
          messages: turns,
        }),
      });
    } else {
      const { url, headers } = openAiStyleEndpoint(settings);
      reply = await fetchStreamText(what, url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: settings.model,
          stream: true,
          messages: [{ role: "system", content: system }, ...turns],
        }),
      });
    }
  } catch (e) {
    if (e instanceof RequestTimeoutError) throw e;
    throw new Error(
      local
        ? `Could not reach Ollama at ${normalizeServerUrl(settings.baseUrl ?? "")}. Check that Ollama is running and that it allows this app (set OLLAMA_ORIGINS).`
        : "Could not reach the AI provider. Check your connection and try again.",
    );
  }

  const { response, text: raw } = reply;
  if (!response.ok) throw new Error(errorText(parseBody(raw), response.status, response.statusText));
  const text = isEventStream(response, raw) ? textFromStream(settings, raw) : textFromWholeReply(settings, parseBody(raw));
  if (!text.trim()) throw new Error("The AI provider sent back an empty reply.");
  return text.trim();
}

function parseBody(raw: string): (OpenAiBody & AnthropicBody) | null {
  try {
    return JSON.parse(raw) as OpenAiBody & AnthropicBody;
  } catch {
    return null;
  }
}

/** A provider may ignore `stream: true` and send the whole reply at once; both are accepted. */
function isEventStream(response: Response, raw: string): boolean {
  return (response.headers.get("Content-Type") ?? "").includes("text/event-stream") || /^\s*(data|event):/.test(raw);
}

function textFromWholeReply(settings: AiSettings, body: (OpenAiBody & AnthropicBody) | null): string {
  if (settings.provider !== "anthropic") return body?.choices?.[0]?.message?.content ?? "";
  return (body?.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");
}

interface StreamEvent extends ApiErrorBody {
  /** OpenAI-style providers: each piece of the reply. Reasoning pieces are ignored. */
  choices?: { delta?: { content?: string | null } }[];
  /** Anthropic: "content_block_delta" carries text; "error" carries a failure. */
  type?: string;
  delta?: { type?: string; text?: string };
}

/**
 * Joins the pieces of a streamed reply ("data: {...}" lines). A provider that fails partway
 * sends an error event instead of more text; that is shown rather than a half reply.
 */
function textFromStream(settings: AiSettings, raw: string): string {
  let text = "";
  for (const line of raw.split("\n")) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") continue;
    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      continue;
    }
    if (event.error || event.type === "error") {
      const message = typeof event.error === "string" ? event.error : event.error?.message;
      throw new Error(message || "The AI provider stopped with an error partway through. Try again.");
    }
    if (settings.provider === "anthropic") {
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") text += event.delta.text ?? "";
    } else {
      text += event.choices?.[0]?.delta?.content ?? "";
    }
  }
  return text;
}
/**
 * Who the AI is told it is for the copy-editing pass and its chat: the author-written
 * copy editor description, then the chosen style guide's own description, which says
 * which manual this book follows. The guide's rules list goes into the request as well.
 */
export function copyEditorPersona(style: StyleGuideAgent): string {
  return `${ROLE_PROMPT["copy-editor"]}

The style guide chosen for this book (${style.label}):
${style.persona}`;
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
  const end = reply.lastIndexOf(close);
  // The JSON may follow prose that itself contains the opening bracket ("[Note] here you go: [...]"),
  // so try each opening bracket in turn until one parses (F18).
  for (let start = reply.indexOf(open); start !== -1 && start < end; start = reply.indexOf(open, start + 1)) {
    try {
      return JSON.parse(reply.slice(start, end + 1));
    } catch {
      // Not the start of the JSON; try the next bracket.
    }
  }
  throw new Error("The AI reply was not in the expected format. Try again.");
}

/** Characters of chapter text sent to the AI in one review request. */
export const CHAPTER_PART_CHARACTERS = 24000;

/**
 * Splits a chapter's text into parts under `limit` characters, at paragraph breaks
 * where it can, so every passage the AI quotes lies whole inside one part. A single
 * paragraph longer than the limit is cut at a sentence end, else at a space.
 */
export function chapterParts(text: string, limit: number): string[] {
  const pieces: string[] = [];
  for (const paragraph of text.split("\n")) {
    let rest = paragraph;
    while (rest.length > limit) {
      const window = rest.slice(0, limit);
      let cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? ")) + 1;
      if (cut <= 0) cut = window.lastIndexOf(" ");
      if (cut <= 0) cut = limit;
      pieces.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    pieces.push(rest);
  }
  const parts: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 1 + piece.length > limit) {
      parts.push(current);
      current = piece;
    } else {
      current = current ? `${current}\n${piece}` : piece;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.length > 0 ? parts : [""];
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
  // Only the developmental pass sends book context: chapter summaries, small enough to send whole.
  const context = bookContext.trim() ? `\n\nTHE BOOK SO FAR (a summary of every chapter):\n${bookContext}` : "";
  const format =
    info.output === "notes"
      ? `Reply with ONLY a JSON array (no prose, no code fences) of at most 8 objects with the keys "passage" and "comment". ` +
        `"passage" is a short quote copied exactly, character for character, from one paragraph of the chapter that the note is about, or "" when it concerns the whole chapter. ` +
        `"comment" is the note: what the problem is and how the author could fix it. Reply with [] if there is nothing to raise.`
      : `Reply with ONLY a JSON array (no prose, no code fences) of at most 12 objects with the keys ` +
        `"original", "replacement" and "comment". "original" must be copied exactly, character for character, ` +
        `from one single paragraph of the chapter and be long enough to be unique. "replacement" is the corrected text. ` +
        `"comment" is a short reason. Reply with [] if nothing needs changing.`;
  // A long chapter is read in parts, one request each, so no text is left unread.
  const parts = chapterParts(chapterText, CHAPTER_PART_CHARACTERS);
  const replies: unknown[] = [];
  for (let i = 0; i < parts.length; i++) {
    const label = parts.length > 1 ? `CHAPTER (part ${i + 1} of ${parts.length}; the other parts are reviewed separately):` : "CHAPTER:";
    const prompt = `${info.task}${guide}\n\n${format}${context}\n\n${label}\n${parts[i]}`;
    const reply = await askAi(settings, persona ?? info.persona, [{ role: "user", content: prompt }]);
    const parsed = parseJson(reply, "[");
    if (!Array.isArray(parsed)) throw new Error("The AI reply was not in the expected format. Try again.");
    replies.push(...parsed);
  }

  const edits: ProposedEdit[] = [];
  for (const entry of replies) {
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