import { describe, expect, it } from "vitest";
import type { AiProvider, EditStage } from "@/db/schema";
import { DEFAULT_MODEL, DEFAULT_STAGE_MODEL, MODEL_SUGGESTIONS, OLLAMA_CLOUD_MODELS } from "@/lib/providers";

const PROVIDERS = Object.keys(DEFAULT_MODEL) as AiProvider[];

describe("model lists", () => {
  it("every provider's default model is one the dropdown offers", () => {
    for (const p of PROVIDERS) expect([p, MODEL_SUGGESTIONS[p]]).toEqual([p, expect.arrayContaining([DEFAULT_MODEL[p]])]);
  });

  it("every per-editor default is one the dropdown offers", () => {
    for (const p of PROVIDERS) {
      for (const [stage, model] of Object.entries(DEFAULT_STAGE_MODEL[p]) as [EditStage, string][]) {
        expect([p, stage, MODEL_SUGGESTIONS[p].includes(model)]).toEqual([p, stage, true]);
      }
    }
  });

  it("Ollama Cloud offers the verified cloud list, without local-only models", () => {
    expect(MODEL_SUGGESTIONS["ollama-cloud"]).toBe(OLLAMA_CLOUD_MODELS);
    expect(OLLAMA_CLOUD_MODELS).toHaveLength(24);
    expect(new Set(OLLAMA_CLOUD_MODELS).size).toBe(OLLAMA_CLOUD_MODELS.length);
    for (const local of ["llama3.2", "llama3.1", "mistral", "qwen2.5", "gemma2"]) expect(OLLAMA_CLOUD_MODELS).not.toContain(local);
  });
});
