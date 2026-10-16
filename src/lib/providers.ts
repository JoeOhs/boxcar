import type { AiProvider, EditStage } from "@/db/schema";

/**
 * The AI providers the AI staff can run on, and every model id the app starts with.
 * This is the one place to change a default model; the author can also type any
 * other model name in Settings (and per editing pass in Edit).
 */

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  huggingface: "Hugging Face",
  ollama: "Ollama (on this computer)",
};

/** The model a new key starts with. */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: "gpt-6.1-sol",
  anthropic: "claude-sonnet-5-5",
  huggingface: "meta-llama/Llama-3.3-70B-Instruct",
  ollama: "llama3.2",
};

/** A different model for each editing pass out of the box. An empty entry means "use the model on the key". */
export const DEFAULT_STAGE_MODEL: Record<AiProvider, Partial<Record<EditStage, string>>> = {
  openai: { developmental: "gpt-6.1-sol-pro", line: "gpt-6.1-sol", copy: "gpt-6-luna-pro", proofread: "gpt-6-luna" },
  anthropic: {
    developmental: "claude-fable-5-1",
    line: "claude-opus-5-5",
    copy: "claude-sonnet-5-5",
    proofread: "claude-haiku-5-5",
  },
  huggingface: {},
  ollama: {},
};

/** Suggestions offered in the model field; any model name the provider accepts can be typed instead. */
export const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  openai: ["gpt-6.1-sol", "gpt-6.1-sol-pro", "gpt-6-luna", "gpt-6-luna-pro"],
  anthropic: ["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  huggingface: [
    "meta-llama/Llama-3.3-70B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct",
    "Qwen/Qwen2.5-72B-Instruct",
  ],
  ollama: ["llama3.2", "llama3.1", "mistral", "qwen2.5", "gemma2"],
};

/** Where the AI staff's keys come from, shown beside the key field. */
export const KEY_HINT: Record<AiProvider, string> = {
  openai: "sk-...",
  anthropic: "sk-ant-...",
  huggingface: "hf_...",
  ollama: "",
};

export const OLLAMA_DEFAULT_URL = "http://localhost:11434";

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
