import type { AiProvider, EditStage } from "@/db/schema";

/**
 * The AI providers the AI staff can run on, and every model id the app uses.
 * This is the one place to change a model id. The author picks every model from a
 * dropdown in Settings (the key's default model, and one per editing agent), never
 * by typing a name.
 */

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  huggingface: "Hugging Face",
  ollama: "Ollama (on this computer)",
  "ollama-cloud": "Ollama Cloud",
};

/** The model a new key starts with. */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: "gpt-6.1-sol",
  anthropic: "claude-sonnet-5-5",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  ollama: "llama3.2",
  // llama3.2 is not served by Ollama Cloud; gpt-oss:120b is (see OLLAMA_CLOUD_MODELS).
  "ollama-cloud": "gpt-oss:120b",
};

/**
 * The models Ollama Cloud serves, as listed by GET https://ollama.com/v1/models on
 * 2026-11-17 (24 models; the same names appear at ollama.com/search?c=cloud). Ollama
 * changes this list often, so check it again when updating the app.
 */
export const OLLAMA_CLOUD_MODELS = [
  "beam",
  "clef:27b",
  "deepseek-v4-pro:0813",
  "deepseek-v4.1-flash",
  "deepseek-v4.1-flash:1017",
  "gemma4:31b",
  "glm-5.2",
  "glm-5.3",
  "glm-5.3-flash",
  "gpt-oss:120b",
  "gpt-oss:20b",
  "inkling-2-small",
  "kimi-k2.6",
  "kimi-k2.7-code",
  "kimi-k3",
  "kimi-k3.1-pro",
  "mimo-v2.6-flash",
  "mimo-v2.6-pro",
  "minimax-m3",
  "minimax-m3.1-flash",
  "mistral-large-4",
  "muse-spark-open",
  "nemotron-3-super",
  "nemotron-3-ultra",
];

/** A different model for each editing pass out of the box. An empty entry means "use the model on the key". */
export const DEFAULT_STAGE_MODEL: Record<AiProvider, Partial<Record<EditStage, string>>> = {
  openai: { developmental: "gpt-6.1-terra", line: "gpt-6.1-sol", copy: "gpt-6-luna", proofread: "gpt-6-sol" },
  anthropic: {
    developmental: "claude-fable-5-1",
    line: "claude-opus-5-5",
    copy: "claude-sonnet-5-5",
    proofread: "claude-haiku-5-5",
  },
  huggingface: {},
  ollama: {},
  "ollama-cloud": {},
};

/**
 * The model the AI voice uses to read a manuscript aloud (narration preview in
 * Write, and the audiobook export). It is an OpenAI speech model, so it needs the
 * author's OpenAI key. The author can change it here.
 */
export const NARRATION_MODEL = "gpt-4o-mini-tts";

/**
 * The models offered in each model dropdown, prefilled for the provider. The author
 * chooses from this list; the app does not take free text for a model.
 */
export const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  openai: ["gpt-6.1-terra", "gpt-6.1-sol", "gpt-6-luna", "gpt-6-sol"],
  anthropic: ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  huggingface: [
    "meta-llama/Llama-3.3-70B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
  ],
  ollama: ["llama3.2", "llama3.1", "mistral", "qwen2.5", "gemma2"],
  "ollama-cloud": OLLAMA_CLOUD_MODELS,
};

/** Where the AI staff's keys come from, shown beside the key field. */
export const KEY_HINT: Record<AiProvider, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  huggingface: "hf_...",
  ollama: "",
  "ollama-cloud": "ollama_...",
};

export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
/** Ollama Cloud API endpoint for hosted inference. Get a key at ollama.com. */
export const OLLAMA_CLOUD_URL = "https://ollama.com";

/**
 * The path on the app's own address that forwards to Ollama Cloud. ollama.com sends no
 * CORS headers, so a web page cannot call it directly: the browser blocks the request.
 * A request to the app's own address needs no CORS check, and the desktop app
 * (ganger-release/main.js) and the Vite dev/preview servers (vite.config.ts) forward
 * this path to https://ollama.com.
 */
export const OLLAMA_CLOUD_PROXY_PATH = "/__ollama-cloud";

/**
 * Where to send Ollama Cloud requests from a page at `location`: through the forwarding
 * path in the desktop app (app://) and on this computer's dev servers, which provide it;
 * straight to ollama.com anywhere else (where the browser will block it, as before).
 */
export function ollamaCloudBaseUrl(location: Pick<Location, "protocol" | "host" | "hostname">): string {
  const forwarded =
    location.protocol === "app:" ||
    (/^https?:$/.test(location.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
  return forwarded ? `${location.protocol}//${location.host}${OLLAMA_CLOUD_PROXY_PATH}` : OLLAMA_CLOUD_URL;
}

/** Ollama runs on the author's own computer and takes no key. */
export function providerNeedsKey(provider: string): boolean {
  return provider !== "ollama";
}

/** Providers that need the address of a server instead of (or as well as) a key. */
export function providerHasServerUrl(provider: string): boolean {
  return provider === "ollama";
}

/** Cleans up an address the author typed: no trailing slashes, and http:// when the scheme is left out. */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return OLLAMA_DEFAULT_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}
