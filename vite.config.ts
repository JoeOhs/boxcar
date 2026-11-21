import { fileURLToPath, URL } from "node:url";
import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Forwards /__ollama-cloud/* to https://ollama.com/*, which a page cannot call directly
 * (no CORS headers). Mirrors the forwarding in ganger-release/main.js, so Ollama Cloud
 * works while testing in the browser too. See OLLAMA_CLOUD_PROXY_PATH in src/lib/providers.ts.
 */
const ollamaCloudProxy: Record<string, ProxyOptions> = {
  "/__ollama-cloud": {
    target: "https://ollama.com",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/__ollama-cloud/, ""),
    configure: (proxy) => {
      proxy.on("proxyReq", (request) => {
        request.removeHeader("origin");
        request.removeHeader("referer");
      });
    },
  },
};

export default defineConfig({
  // Relative base so the bundle also works when opened from a desktop wrapper.
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: { proxy: ollamaCloudProxy },
  preview: { proxy: ollamaCloudProxy },
});
