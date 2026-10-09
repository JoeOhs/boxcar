# UI shell

Vite + React + Tailwind CSS (v4) + shadcn/ui-style components (copied into `src/components/ui`). There is no router: `App.tsx` shows one screen at a time from a sidebar, and the current screen lives in `AppState`. Everything reads and writes the Dexie database defined in `src/db/schema.ts`; no screen keeps its own copy of the data.

## Layout (`src/App.tsx`)
- Left sidebar: the current workspace (pen name), the screens (Manuscripts, Outline, Write, Edit, Format, Book Cover, Export), then the Workspaces button, Settings with the light/dark toggle, and an offline notice. There is no manuscript drop-down; the manuscript is chosen in the Manuscripts screen.
- Main area: the current screen. The active workspace, manuscript and the chapter shared by Write and Edit are in `src/state/AppState.tsx`; the first two are saved in the `settings` table (`activeWorkspaceId`, `activeManuscriptId`, `theme`).

## Screens and the must-have each is for

| Screen file | Must-have | What the author can do | Tables used |
| --- | --- | --- | --- |
| `src/screens/Outline.tsx` | MH-1 outline | Build an act / chapter / scene / beat tree: add, add inside, reorder, indent, outdent, delete; edit title, summary and notes; start from a three-act template; create chapters from the outline or open a node's written chapter; talk to the AI Outliner | `outlineItems`, `chapters`, `agentMessages` |
| `src/screens/Write.tsx` | MH-2 write | Add, order, delete front matter, chapters and back matter; write in a rich-text editor (bold, italic, headings, quotes, lists, scene breaks) that autosaves; set chapter status; live word counts against the target | `chapters` |
| `src/screens/Edit.tsx` | MH-3 edit | Read a chapter and add suggested changes from selected text; accept (applies the change) or reject; ask the AI Editor or Proofreader to review the chapter or chat about it; snapshot, compare and restore revisions | `suggestions`, `revisions`, `chapters`, `agentMessages` |
| `src/screens/Format.tsx` | MH-4 format | Set font, size, line spacing, paragraph style, chapter headings, scene break, drop caps, table of contents and trim size; see a live preview built by the same code as the export; ask the AI Formatter | `manuscripts` (embedded `format`), `chapters`, `agentMessages` |
| `src/screens/Export.tsx` | MH-5 and export | Fill in the KDP book details and cover, see a readiness checklist, and export an EPUB 3 file for Amazon KDP | `manuscripts`, `chapters` |

Supporting screens (not must-haves on their own):
- `src/screens/WorkspaceGate.tsx`: the first screen. Choose an author/pen name workspace or create one; nothing else is shown until then. `src/components/WorkspaceSwitcher.tsx` is the "Workspaces" button at the bottom of the left menu (switch or add a workspace).
- `src/screens/Manuscripts.tsx`: rename and delete the open workspace; create, open and delete manuscripts in it; set stage and target word count.
- `src/screens/Settings.tsx`: the author's own AI provider (OpenAI or Anthropic), key and model, saved with `saveAiSettings` and tested on request.

## Supporting code
- `src/lib/store.ts`: write operations (create/patch workspaces, manuscripts, outline items, chapters, snapshots).
- `src/lib/epub.ts`: `buildEpub` (EPUB 3 + NCX, cover, TOC, KDP metadata via JSZip), `buildCss` and `buildPreviewDocument` (shared by preview and export).
- `src/lib/ai.ts`: calls the chosen provider straight from the app with the author's key (`askAi`, `requestStageReview`, `requestFormatPreset`) and the role prompts. `src/components/AgentChat.tsx` is the per-role conversation saved in `agentMessages`.
- `src/lib/text.ts`, `chapters.ts`, `outline.ts`, `hooks.ts`, `download.ts`: helpers.
- `public/sw.js` and `public/manifest.webmanifest`: let the built app open with no connection.

## Behaviour notes
- No account: nothing asks you to sign in.
- Offline: every screen except the AI features works with no connection. The AI panels say so and disable sending; past conversations stay readable.
- The AI never changes the text on its own: the Editor's and Proofreader's output becomes pending suggestions, and accepting one saves a revision first.
- Accepting a suggestion finds the passage by its exact text. If the passage spans bold or italic text inside one paragraph, that paragraph is rewritten as plain text; if it is not found, nothing changes and the author is told.
- Dependencies were not installed or type-checked by this journeyman.
