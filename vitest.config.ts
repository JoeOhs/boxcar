import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Audit test config. Kept separate from vite.config.ts so the app build is untouched.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts"],
    setupFiles: ["tests/unit/setup.ts"],
    testTimeout: 20000,
  },
});
