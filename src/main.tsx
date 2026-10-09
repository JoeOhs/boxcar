import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateLegacyKeys } from "./lib/keyVault";
import { AppProvider } from "./state/AppState";

// Keys an earlier version saved as plain text are encrypted before anything reads them.
void migrateLegacyKeys();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// Keeps the app available with no connection once it has been opened once.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline caching is a bonus; the app works without it.
    });
  });
}
