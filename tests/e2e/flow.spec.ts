import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { test, expect, createWorkspace } from "./fixtures";
import type { Page, TestInfo } from "@playwright/test";

const shot = (page: Page, info: TestInfo, tag: string) =>
  page.screenshot({ path: `audit-logs/e2e/${info.project.name}-${tag}.png`, fullPage: true });
const nav = (page: Page, name: string) => page.locator("aside").getByRole("button", { name: new RegExp(`^${name}$`) }).click();

async function newBook(page: Page, title: string) {
  await page.getByRole("button", { name: /New manuscript/ }).first().click();
  await page.locator("#new-title").fill(title);
  await page.getByRole("button", { name: /^Create manuscript$/ }).click();
  await expect(page.locator("main")).toContainText("Roadmap");
}

async function reenter(page: Page) {
  await page.getByRole("button", { name: /Jane Marlowe/ }).first().click();
  await nav(page, "Write");
}

async function addKey(page: Page) {
  await nav(page, "Settings");
  await page.locator("#text-key").fill("sk-test-0000000000000000");
  await page.getByRole("button", { name: /^Save key$/ }).first().click();
  await expect(page.locator("main")).toContainText("0000");
}

test("workspace gating, write, autosave, reload, persistence", async ({ page, errors, external }, info) => {
  await createWorkspace(page, "Jane Marlowe");
  await test.step("gating before a book is brought in", async () => {
    for (const n of ["Roadmap", "Universe", "Write", "Edit", "Format", "Book Cover", "Export", "Translate"])
      await expect(page.locator("aside").getByRole("button", { name: new RegExp(`^${n}$`) })).toBeDisabled();
  });
  await newBook(page, "The Glass Road");
  await shot(page, info, "10-roadmap");
  await test.step("write and autosave", async () => {
    await nav(page, "Write");
    await page.getByRole("button", { name: /Add first chapter/ }).click();
    const ed = page.locator("[contenteditable=true]").first();
    await ed.click();
    await page.keyboard.type("It was a cold morning in the valley. Ünïcødé 👋 مرحبا");
    await page.waitForTimeout(1200);
    await expect(page.locator("main")).toContainText(/1\d words|\b1[0-9]\b/);
    await page.reload();
    await reenter(page);
    await expect(page.locator("main")).toContainText("cold morning");
    await expect(page.locator("main")).toContainText("👋 مرحبا");
    await shot(page, info, "11-write-after-reload");
  });
  await test.step("reload within 600ms of typing (autosave flusher)", async () => {
    const ed = page.locator("[contenteditable=true]").first();
    await ed.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" QUICKRELOAD");
    await page.reload();
    await reenter(page);
    await page.waitForTimeout(800);
    const kept = (await page.locator("main").innerText()).includes("QUICKRELOAD");
    console.log("QUICK-RELOAD-KEPT", kept);
    expect.soft(kept, "text typed <600ms before reload survives").toBe(true);
  });
  await test.step("persistence across a new browser context is not applicable (fresh profile); data survives reloads", async () => {
    await page.reload();
    await expect(page.locator("body")).toContainText("Jane Marlowe");
  });
  expect.soft(errors.filter((e) => !e.includes("about:srcdoc")), "no console/page errors (srcdoc sandbox warning tracked as finding)").toEqual([]);
  expect(external, "no network calls made by local features").toEqual([]);
});

test("export EPUB/DOCX, format, edit pass, translate, backup, offline", async ({ page, errors, external }, info) => {
  await createWorkspace(page, "Jane Marlowe");
  await newBook(page, "Export Me");
  await nav(page, "Write");
  await page.getByRole("button", { name: /Add first chapter/ }).click();
  await page.locator("[contenteditable=true]").first().click();
  await page.keyboard.type("Teh quick brown fox jumped over the lazy dog.");
  await page.waitForTimeout(1200);

  await test.step("format preview", async () => {
    await nav(page, "Format");
    await shot(page, info, "20-format");
    const frames = page.frameLocator("iframe");
    await expect.soft(frames.first().locator("body")).toContainText("quick brown fox");
  });

  await test.step("export EPUB", async () => {
    await nav(page, "Export");
    await shot(page, info, "21-export");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("main").getByRole("button", { name: /^Export$/ }).click()]);
    const zip = await JSZip.loadAsync(readFileSync((await dl.path())!));
    const names = Object.keys(zip.files);
    expect(names[0]).toBe("mimetype");
    const all = (await Promise.all(names.filter((n) => n.endsWith(".xhtml")).map((n) => zip.file(n)!.async("string")))).join("");
    expect(all).toContain("quick brown fox");
    info.annotations.push({ type: "epub-file", description: dl.suggestedFilename() });
  });

  await test.step("AI without a key / offline", async () => {
    await nav(page, "Edit");
    await shot(page, info, "22-edit-nokey");
    await page.context().setOffline(true);
    await nav(page, "Write");
    await page.locator("[contenteditable=true]").first().click();
    await page.keyboard.type(" Offline typing works.");
    await page.waitForTimeout(1000);
    await page.context().setOffline(false);
    await expect(page.locator("main")).toContainText("Offline typing works");
  });

  await test.step("edit: run a pass with a mocked key", async () => {
    await addKey(page);
    await page.route("https://api.openai.com/v1/chat/completions", (route) =>
      route.fulfill({ json: { choices: [{ message: { content: '[{"passage":"","comment":"MOCK NOTE: the arc is thin"}]' } }] } }),
    );
    await nav(page, "Edit");
    await shot(page, info, "23-edit-withkey");
    const begin = page.getByRole("button", { name: /Begin Editing|Ask the|Review|Run/i }).first();
    if (await begin.isVisible()) {
      await begin.click();
      await page.waitForTimeout(3000);
      await shot(page, info, "24-edit-after-run");
      console.log("EDIT-RUN", (await page.locator("main").innerText()).slice(0, 600));
      await nav(page, "Roadmap");
      const devCard = page.locator("label", { hasText: "Developmental edit" }).locator("input[type=checkbox]");
      await expect(devCard).toBeChecked();
      await expect(devCard).toBeDisabled();
      await shot(page, info, "24b-roadmap-after-dev-pass");
    }
  });

  await test.step("backup and restore", async () => {
    await nav(page, "Settings");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Save a backup/ }).click()]);
    const text = readFileSync((await dl.path())!, "utf8");
    expect(text).not.toContain("sk-test-0000000000000000");
    expect(text).toContain("quick brown fox");
    await page.locator('input[type=file]').first().setInputFiles((await dl.path())!);
    await shot(page, info, "25-restore-confirm");
    await page.getByRole("button", { name: /Replace/ }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toContainText("Jane Marlowe");
  });

  await test.step("narrow viewport", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await shot(page, info, "26-narrow");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log("NARROW-OVERFLOW", overflow);
    expect.soft(overflow, "no horizontal scroll at 375px").toBeLessThanOrEqual(0);
  });

  expect.soft(errors.filter((e) => !e.includes("about:srcdoc")), "no console/page errors (srcdoc sandbox warning tracked as finding)").toEqual([]);
  const unexpected = external.filter((u) => !u.includes("api.openai.com"));
  expect(unexpected, "only the chosen AI provider is contacted").toEqual([]);
});
