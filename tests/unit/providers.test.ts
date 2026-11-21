import { describe, expect, it } from "vitest";
import type { AiProvider, EditStage } from "@/db/schema";
import { DEFAULT_MODEL, DEFAULT_STAGE_MODEL, MODEL_SUGGESTIONS, OLLAMA_CLOUD_MODELS, ollamaCloudBaseUrl } from "@/lib/providers";

const PROVIDERS = Object.keys(DEFAULT_MODEL) as AiProvider[];

describe("Ollama Cloud address (no CORS on ollama.com)", () => {
  const at = (href: string) => {
    const u = new URL(href);
    return ollamaCloudBaseUrl({ protocol: u.protocol, host: u.host, hostname: u.hostname });
  };
  it("the desktop app forwards through its own app:// address", () => {
    expect(at("app://local/")).toBe("app://local/__ollama-cloud");
  });
  it("the dev and preview servers on this computer forward too", () => {
    expect(at("http://localhost:5173/")).toBe("http://localhost:5173/__ollama-cloud");
    expect(at("http://127.0.0.1:5299/")).toBe("http://127.0.0.1:5299/__ollama-cloud");
  });
  it("anywhere else it calls ollama.com directly", () => {
    expect(at("https://boxcar.example.com/")).toBe("https://ollama.com");
  });
});

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
