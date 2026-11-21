import { describe, expect, it } from "vitest";
import { getEditModels, saveEditModel, type AiSettings } from "@/db/schema";
import { flagRequestPrompt } from "@/components/Ghostwriter";
import { modelForStage, settingsForStage } from "@/lib/editing";

const KEY: AiSettings = { provider: "ollama-cloud", apiKey: "k", model: "gpt-oss:120b" };

describe("Send to Ghostwriter", () => {
  it("asks for a new passage that deals with the flag, naming the editor and chapter", () => {
    const prompt = flagRequestPrompt("Character editor", "The Crossing", "Mara's motive is never stated.");
    expect(prompt).toContain('The character editor flagged this in the developmental edit of "The Crossing"');
    expect(prompt).toContain("\"Mara's motive is never stated.\"");
    expect(prompt).toContain("Write a new passage, in my voice");
    expect(flagRequestPrompt("Pacing editor", "", "x")).toContain('"Untitled"');
  });
});

describe("the Ghostwriter's model", () => {
  it("is chosen per provider, separately from the editors, and used for its requests", async () => {
    await saveEditModel("ollama-cloud", "developmental", "kimi-k3");
    await saveEditModel("ollama-cloud", "ghostwriter", "glm-5.3");
    await saveEditModel("openai", "ghostwriter", "gpt-6-sol");
    const models = await getEditModels();
    expect(modelForStage("ollama-cloud", models, "ghostwriter", KEY.model)).toBe("glm-5.3");
    expect(modelForStage("ollama-cloud", models, "developmental", KEY.model)).toBe("kimi-k3");
    expect(modelForStage("openai", models, "ghostwriter")).toBe("gpt-6-sol");
    expect(settingsForStage(KEY, models, "ghostwriter")).toEqual({ ...KEY, model: "glm-5.3" });
  });

  it("falls back to the key's own model until one is chosen", () => {
    expect(modelForStage("ollama-cloud", {}, "ghostwriter", KEY.model)).toBe("gpt-oss:120b");
  });
});
