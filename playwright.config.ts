import { defineConfig } from "@playwright/test";

// E2E audit config. Runs against the dev server and the production preview build.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  reporter: [["list"]],
  use: { screenshot: "on", trace: "retain-on-failure" },
  projects: [
    { name: "dev", use: { baseURL: "http://localhost:5199" } },
    { name: "preview", use: { baseURL: "http://localhost:5299" } },
  ],
  webServer: [
    { command: "npx vite --port 5199 --strictPort", url: "http://localhost:5199", reuseExistingServer: false },
    { command: "npx vite build && npx vite preview --port 5299 --strictPort", url: "http://localhost:5299", reuseExistingServer: false, timeout: 120000 },
  ],
});
