# Integration

Each must-have from `ganger/brain/CONSTITUTION.md`, with the file and function that implements it. Every screen reads and writes the Dexie database in `src/db/schema.ts` (through `src/lib/store.ts` or the table itself); no screen keeps its own copy of stored data. Every screen is reached from the sidebar in `src/App.tsx`, which is only shown once a workspace has been chosen on the first screen.

| Must-have | Screen (reachable from the sidebar) | Main function | Data it works on |
| --- | --- | --- | --- |
| MH-1 outline | `src/screens/Outline.tsx` | `Outline` (tree editing: `addOutlineItem`, `moveOutlineItem`, `applyThreeActTemplate`, `chaptersFromOutline` in `src/lib/store.ts`) | `outlineItems`, linked to `chapters` |
| MH-2 write | `src/screens/Write.tsx` | `Write` (a chapter is a stack of segments: `useChapterDraft` adds, renames, deletes and drag-reorders them in the menu and in the writing block; text field in `src/components/RichEditor.tsx`; segment helpers in `src/lib/segments.ts`; saving by `createChapter`, `saveChapter`, `moveChapter` in `src/lib/store.ts`) | `chapters` (segments live inside `chapters.content`) |
| MH-3 edit | `src/screens/Edit.tsx` | `Edit` (`WorkflowBar` runs the four passes in order - developmental, line, copy, proofreading - with `selectStage`, `completeStage`, `reopenStage` and a model per pass, all in `src/lib/editing.ts`; `SuggestionsPanel` runs `requestStageReview` and accepts or rejects changes with `replaceInHtml`; `RevisionsPanel` snapshots, compares and restores with `snapshotChapter`) | `manuscripts.editWorkflow`, `settings` (`editModels`), `suggestions`, `revisions`, `chapters` |
| MH-4 format | `src/screens/Format.tsx` | `Format` (presets from `src/lib/formatPresets.ts`; "Let AI choose the preset" calls `requestFormatPreset` in `src/lib/ai.ts`; settings written with `patchManuscript`; preview from `buildPreviewDocument` in `src/lib/epub.ts`) | `manuscripts.format`, `chapters` |
| MH-5 and export | `src/screens/Export.tsx` | `Export` calls `buildEpub` in `src/lib/epub.ts`, then `downloadBlob` in `src/lib/download.ts` | `manuscripts` (KDP details, cover, `lastExportedAt`), `chapters` |
| MH-6 workspace per author or pen name | `src/screens/WorkspaceGate.tsx` (first screen); `src/components/WorkspaceSwitcher.tsx` (button at the bottom of the left menu) | `WorkspaceGate`, `WorkspaceSwitcher` (`createWorkspace` in `src/lib/store.ts`, `selectWorkspace` in `src/state/AppState.tsx`) | `workspaces`, `manuscripts.workspaceId` |

## How the pieces connect
- **Workspaces (pen names):** the first screen (`WorkspaceGate`) asks for a workspace to be chosen or created, and every section (Manuscripts, Outline, Write, Edit, Format, Export, Settings) is nested inside that workspace. The "Workspaces" button at the bottom of the left menu (`WorkspaceSwitcher`) switches workspace or adds one. `src/screens/Manuscripts.tsx` creates the workspace's manuscripts. `src/state/AppState.tsx` holds the active workspace and manuscript (saved in the `settings` table), and every book screen works on that manuscript.
- **Segments:** each chapter is a stack of segments stored inside the chapter HTML as `<section data-segment>` blocks, so revisions, suggestions, the preview and the epub keep using the one stored text. `toXhtmlBody` unwraps them for the book.
- **Editing workflow:** progress (`editWorkflow`) is stored on the manuscript; each pass can use a different model, chosen in the Edit screen and stored per provider in `settings` (`editModels`). The AI calls use the author's own key.
- **Outline to Write:** "Start writing this" (`chapterForOutlineItem`) and "Create chapters from outline" (`chaptersFromOutline`, in outline order) make `chapters` rows and link them to the outline item through `chapterId`. Write and Edit share the chosen chapter through `AppState`.
- **Write to Edit:** Edit reads the same `chapters` rows. Accepting a suggestion saves a revision first, then rewrites the chapter text.
- **Format to Export:** The Format screen stores `FormatSettings` on the manuscript. The live preview and the epub both use `buildCss` and the same chapter markup, so the preview matches the exported file.
- **Export:** `buildEpub` produces an EPUB 3 file (with a table of contents, cover, title page, copyright page and KDP metadata) that the author uploads to Amazon KDP.
- **AI staff:** `src/lib/ai.ts` (`askAi`, `requestStageReview`, `requestFormatPreset`) calls OpenAI or Anthropic directly with the key the author enters in `src/screens/Settings.tsx` (saved by `saveAiSettings`). Conversations are saved in `agentMessages` through `src/components/AgentChat.tsx`: Outliner (Outline), Editor and Proofreader (Edit), Formatter (Format). The AI only proposes changes; the author accepts them.

## Accounts and connection
- No sign-in: nothing in the app asks for an account.
- Offline: all data is local (IndexedDB), and `public/sw.js` lets the built app open with no connection. Only the AI staff need a connection; their panels turn back on by themselves when the connection returns (`useOnline` in `src/lib/hooks.ts`).

## Settings
The app reads nothing from the environment (`.env.example` says so). The author's AI key is entered in the app.
