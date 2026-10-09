# Integration

Each must-have from `ganger/brain/CONSTITUTION.md`, with the file and function that implements it. Every screen reads and writes the Dexie database in `src/db/schema.ts` (through `src/lib/store.ts` or the table itself); no screen keeps its own copy of stored data. Every screen is reached from the sidebar in `src/App.tsx`.

| Must-have | Screen (reachable from the sidebar) | Main function | Data it works on |
| --- | --- | --- | --- |
| MH-1 outline | `src/screens/Outline.tsx` | `Outline` (tree editing: `addOutlineItem`, `moveOutlineItem`, `applyThreeActTemplate`, `chaptersFromOutline` in `src/lib/store.ts`) | `outlineItems`, linked to `chapters` |
| MH-2 write | `src/screens/Write.tsx` | `Write` (editor in `src/components/RichEditor.tsx`, saving by `createChapter`, `saveChapter`, `moveChapter` in `src/lib/store.ts`) | `chapters` |
| MH-3 edit | `src/screens/Edit.tsx` | `Edit` (`SuggestionsPanel` accepts or rejects changes with `replaceInHtml`; `RevisionsPanel` snapshots, compares and restores with `snapshotChapter`) | `suggestions`, `revisions`, `chapters` |
| MH-4 format | `src/screens/Format.tsx` | `Format` (settings written with `patchManuscript`; preview from `buildPreviewDocument` in `src/lib/epub.ts`) | `manuscripts.format`, `chapters` |
| MH-5 and export | `src/screens/Export.tsx` | `Export` calls `buildEpub` in `src/lib/epub.ts`, then `downloadBlob` in `src/lib/download.ts` | `manuscripts` (KDP details, cover, `lastExportedAt`), `chapters` |

## How the pieces connect
- **Workspaces (pen names):** `src/screens/Workspaces.tsx` creates pen names and their manuscripts. `src/state/AppState.tsx` holds the active pen name and manuscript (saved in the `settings` table), and every book screen works on that manuscript.
- **Outline to Write:** "Start writing this" (`chapterForOutlineItem`) and "Create chapters from outline" (`chaptersFromOutline`, in outline order) make `chapters` rows and link them to the outline item through `chapterId`. Write and Edit share the chosen chapter through `AppState`.
- **Write to Edit:** Edit reads the same `chapters` rows. Accepting a suggestion saves a revision first, then rewrites the chapter text.
- **Format to Export:** The Format screen stores `FormatSettings` on the manuscript. The live preview and the epub both use `buildCss` and the same chapter markup, so the preview matches the exported file.
- **Export:** `buildEpub` produces an EPUB 3 file (with a table of contents, cover, title page, copyright page and KDP metadata) that the author uploads to Amazon KDP.
- **AI staff:** `src/lib/ai.ts` (`askAi`, `requestEdits`) calls OpenAI or Anthropic directly with the key the author enters in `src/screens/Settings.tsx` (saved by `saveAiSettings`). Conversations are saved in `agentMessages` through `src/components/AgentChat.tsx`: Outliner (Outline), Editor and Proofreader (Edit), Formatter (Format). The AI only proposes changes; the author accepts them.

## Accounts and connection
- No sign-in: nothing in the app asks for an account.
- Offline: all data is local (IndexedDB), and `public/sw.js` lets the built app open with no connection. Only the AI staff need a connection; their panels turn back on by themselves when the connection returns (`useOnline` in `src/lib/hooks.ts`).

## Settings
The app reads nothing from the environment (`.env.example` says so). The author's AI key is entered in the app.
