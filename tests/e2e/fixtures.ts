import { test as base, expect, type Page } from "@playwright/test";

/** Every off-origin request is answered by a deterministic mock; nothing reaches the internet. */
export const test = base.extend<{ errors: string[]; external: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
    await use(errors);
  },
  external: async ({ page }, use) => {
    const external: string[] = [];
    await page.route(/^https?:\/\/(?!localhost)/, async (route) => {
      const url = route.request().url();
      external.push(url);
      if (url.includes("openai.com/v1/chat") || url.includes("ollama.com") || url.includes("huggingface")) {
        const body = route.request().postDataJSON();
        const text = JSON.stringify(body).includes("JSON array") ? "[]" : "Mocked AI reply.";
        return route.fulfill({ json: { choices: [{ message: { content: text } }] } });
      }
      if (url.includes("anthropic.com")) return route.fulfill({ json: { content: [{ type: "text", text: "[]" }] } });
      if (url.includes("images/generations")) {
        const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        return route.fulfill({ json: { data: [{ b64_json: png }] } });
      }
      return route.fulfill({ status: 404, body: "blocked by audit" });
    });
    await use(external);
  },
});
export { expect };

export async function createWorkspace(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /New Workspace/i }).first().click();
  await page.getByRole("textbox").first().fill(name);
  await page.getByRole("button", { name: /^Create workspace$/i }).click();
}
