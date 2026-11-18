import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { migrateLegacyKeys } from "./lib/keyVault";
import { recoverUnsavedDrafts } from "./lib/draftRecovery";
import { AppProvider } from "./state/AppState";

// Keys an earlier version saved as plain text are encrypted before anything reads them.
void migrateLegacyKeys();

// Typing saved only as a safety copy (the window closed mid-save) goes back into the
// database before the Write screen reads it. A failure here never stops the app opening.
recoverUnsavedDrafts()
  .catch(() => 0)
  .finally(() => {
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <AppProvider>
          <App />
        </AppProvider>
      </StrictMode>,
    );
  });

// Keeps the app available with no connection once it has been opened once.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline caching is a bonus; the app works without it.
    });
  });
}
