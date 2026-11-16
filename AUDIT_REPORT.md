# Boxcar Publishing Studio: Baseline Audit and Fixes

**Audit:** branch `audit/baseline` (from `main` @ `33b6585`, "Release v1.0.2"), 2026-11-09. The audit itself did not modify application source under `src/`. Raw command output is in `audit-logs/`, and browser screenshots are in `audit-logs/e2e/`.

**Fixes:** branch `fix/high-findings` (from `audit/baseline`), 2026-11-10. Seven commits fix all 3 High findings and 8 of the 9 Medium findings (the last is a documentation note). How each fix works is in **§8 Fixes applied**. Patterns we think are worth feeding back into the generator are in **§9 Notes for the Ganger team**. Neither branch has been pushed or merged.

| Status after fixes | High | Medium | Low |
| --- | --- | --- | --- |
| Fixed on `fix/high-findings` | 3 of 3 | 8 of 9 (all but F13) | 0 of 15 |
| Still open | 0 | 1 (F13, documentation) | 15, plus new finding F28 |

## 1. Executive summary

The app is in better shape than its build history suggests. It type-checks, builds, and installs cleanly. The core local data paths work under real tests and in a real browser: workspaces, manuscripts, chapters, cascade deletes, the inception lock, roadmap stage logic, the four-pass edit workflow, key encryption, backup/restore (atomic, Blob-safe, keys excluded), EPUB/DOCX export, import of txt/md/html/docx/epub, translation batching, and audiobook assembly. Two things are missing everywhere: hardening at the edges and a single source of truth. No AI/image/speech request has a timeout. Text that comes back from the AI translator is only partly sanitised. A scene-move race can duplicate text. Suggestions are applied to the first matching passage and can strip formatting. The Roadmap stage and the edit workflow track progress separately and disagree. Several documents describe a different app (a backend, auth, missing report files). Nothing was verified against real AI providers. All provider behaviour here is mocked, and the model IDs in `src/lib/providers.ts` were not checked against real APIs.

The paragraph above describes the app as audited. Every defect it names has since been fixed on `fix/high-findings`; see §8.

| Severity | Found in audit | Found while fixing | Fixed | Open |
| --- | --- | --- | --- | --- |
| Critical | 0 | 0 | 0 | 0 |
| High | 3 | 0 | 3 | 0 |
| Medium | 9 | 1 (F28) | 8 | 2 (F13, F28) |
| Low | 15 | 0 | 0 | 15 |

## 2. Environment and commands

| Item | Value |
| --- | --- |
| OS | Windows 11 Home 10.0.26200 |
| Node / npm installed | v24.19.0 / 11.17.0 |
| Node / npm required | **Not stated** (no `engines` in package.json, no `.nvmrc`). The release workflow uses Node 22. |
| Stack | Vite 6.4.4, React 18.3, TypeScript ~5.6.3, Tailwind 4, Dexie 4, JSZip 3 |

| Command | Result | Log |
| --- | --- | --- |
| `npm ci` (in the original checkout) | **Failed: EPERM.** A running `npm run dev` from the user's session locked `lightningcss.win32-x64-msvc.node`. The failed install also partly removed `node_modules` in that checkout (see §5). | n/a |
| `npm ci` (clean worktree) | Pass. Warns that `esbuild@0.25.12` has an install script not covered by `allowScripts` (npm 11). The committed `package.json` lacks the `allowScripts` block that exists uncommitted in the user's checkout. | `audit-logs/npm-ci.txt` |
| `npx tsc --noEmit` | Pass (exit 0, no diagnostics) | `audit-logs/tsc.txt` |
| Linter | **Not configured** (no ESLint config or dependency). One stray `eslint-disable-next-line` exists in `src/components/RichEditor.tsx:57`. **Not run:** I did not add a throwaway ESLint setup in this pass. | n/a |
| `npx vite build` | Pass. JS 733.41 kB (225.25 kB gzip), CSS 55.00 kB. **Warning:** chunk > 500 kB. | `audit-logs/build.txt` |
| `npm audit` | 1 moderate: vite 6.4.4 `server.fs.deny` bypass (GHSA-8g5g-mxqh-grgj). Dev server only. | `audit-logs/npm-audit.txt` |
| Licenses (`license-checker`) | All permissive. MIT 178, Apache-2.0 13, ISC 11, BSD 4, MPL-2.0 2 (lightningcss, dev/build only, weak copyleft), jszip dual MIT/GPL-3.0 (MIT usable), CC-BY-4.0 1 (caniuse-lite data). UNLICENSED = this project. | `audit-logs/licenses.txt` |
| `npm test` (Vitest) | **82 passed / 0 failed** (17 of these are `it.fails` bug reproductions) | n/a |
| `npm run test:e2e` (Playwright, dev + preview) | **4 passed / 0 failed** | `audit-logs/e2e/*.png` |

### Phase 0 inventory
- File tree: `src/` has 4 root files, `components/` (17), `components/ui/` (7), `db/` (1), `lib/` (36), `screens/` (12), and `state/` (1): about 12.1k lines in lib/db/state/screens. There are also `docs/` (3 md), `ganger/brain/` (6 build-tool records), `ganger-release/` (Electron packaging), `.github/workflows/ganger-release.yml`, and `public/sw.js`.
- TODO / FIXME / stub: **none**. `any`: **none**. `@ts-ignore` / `@ts-expect-error`: **none**. `eslint-disable`: `src/components/RichEditor.tsx:57`. `console.*`: **none**.
- Swallowed errors: `.json().catch(() => null)` at `src/lib/ai.ts:141,148`, `src/lib/imageAi.ts:163,174`, and `src/lib/narration.ts:99` (intentional: they fall back to the HTTP status text). `fetch(first.url).catch(() => null)` is at `src/lib/imageAi.ts:168`. `flush()` swallows save errors at `src/state/AppState.tsx:66-72`, and `migrateLegacyKeys` swallows errors at `src/lib/keyVault.ts:209`. There are 44 `catch` sites in total. Most become user messages.
- Storage outside IndexedDB: `localStorage` is used only for the sidebar-collapsed flag (`src/App.tsx:107,112`).
- Outbound hosts in the code: api.openai.com (chat, images, speech), api.anthropic.com, router.huggingface.co, ollama.com, localhost:11434, generativelanguage.googleapis.com, api.dictionaryapi.dev, and api.datamuse.com. There are no analytics, CDN scripts, or web fonts. `index.html` loads nothing external. The E2E run confirmed that local features made **zero** outbound requests.

## 3. Feature verification matrix

Status key: VERIFIED-E2E, VERIFIED-TEST, CODE-READ-ONLY, BROKEN, MISSING, DOC-MISMATCH. A row can carry two statuses when parts differ.

| Feature | Files / symbols | Claimed behaviour | Status | Evidence |
| --- | --- | --- | --- | --- |
| MH-6 Workspace create | `WorkspaceGate`, `createWorkspace` | Pen-name workspace on first screen | VERIFIED-E2E | flow.spec "workspace gating…"; `*-10-roadmap.png` |
| MH-6 Workspace switch | `WorkspaceSwitcher`, `selectWorkspace` | Switch between workspaces | CODE-READ-ONLY | Only re-entry after reload was exercised |
| MH-6 "Bring to workspace" gating | `App.tsx NavButton` | Roadmap→Translate disabled until a book is active | VERIFIED-E2E | Asserted all 8 buttons disabled; creating a book activates them |
| MH-6 Delete workspace cascade | `deleteWorkspace` | Removes all books and children | VERIFIED-TEST (+ Low bug F16) | db.test "deleteWorkspace removes series books…" |
| MH-8 New manuscript + genre guide | `NewManuscriptForm`, `createManuscript`, `goalWordCount` | Title/type/genre/goal/pen name | VERIFIED-E2E (title only); genre path VERIFIED-TEST | flow.spec `newBook`; store.test |
| MH-8 Inception lock | `patchManuscript` | type/goal/genre locked, blend allowed, stage forward | VERIFIED-TEST, BROKEN for explicit `undefined` (F08) | store.test "inception lock"; `BUG-lock-undefined` |
| MH-1 Outline tree | `addOutlineItem`, `moveOutlineItem`, `deleteOutlineItem` | Tree editing | VERIFIED-TEST (delete); move CODE-READ-ONLY | db.test "deleteOutlineItem…" |
| MH-1 Templates / frameworks / outline import | `applyStartTemplate`, `OUTLINE_FRAMEWORKS`, `readOutline`, `addOutlineTree` | Insert structures | CODE-READ-ONLY | n/a |
| MH-1 Series | `createSeries`, `addSeriesBookTo`, `SeriesBooks` | Volumes; screens follow chosen book | VERIFIED-TEST (create/delete); screen switching NOT exercised | db.test |
| Universe nodes / links | `createUniverseNode`, `patchUniverseNode`, `deleteUniverseNode` | Wiki nodes, tags, fields, links | VERIFIED-TEST (create, link cleanup on delete) | db.test "deleteUniverseNode removes the id…" |
| Universe artwork, outline-from-Universe | `nodeArtworkPrompt`, `outlineFromUniverse` | AI art and outline | CODE-READ-ONLY | n/a |
| v7 migration storyEntries → universeNodes | `BoxcarDB` v7 upgrade | Nothing lost | VERIFIED-TEST | db.test "v7 upgrade moves storyEntries…" (old table left as dead data) |
| Migrations v1 → v7 | `BoxcarDB` | Data preserved | VERIFIED-TEST | db.test "opens a v1 database…" |
| MH-2 Write: typing, autosave, word count | `Write`, `useChapterDraft`, `saveChapter` | 600 ms autosave | VERIFIED-E2E | Text incl. emoji + Arabic survives reload; `*-11-write-after-reload.png` |
| MH-2 Reload within 600 ms of typing | `beforeunload` flush | No lost keystrokes | VERIFIED-E2E (Chromium only) | `QUICK-RELOAD-KEPT true` on dev and preview |
| MH-2 Scenes / move scene / Scrap bin | `moveSceneToChapter`, `ensureScrapChapter` | Move anywhere | VERIFIED-TEST (lib); UI race suspected (F03) | store.test; F03 is CODE-READ-ONLY |
| MH-2 Chapter drag-and-drop | `moveChapterTo` | Reorder / change section | VERIFIED-TEST (lib); DnD UI not exercised | store.test |
| Offline local editing | `useOnline` | Local features keep working | VERIFIED-E2E | Typed while `context.setOffline(true)` |
| Research / Researcher | `ResearchPanel`, `runResearcher` | Notes + AI research | Delete cascade VERIFIED-TEST; rest CODE-READ-ONLY | n/a |
| Word lookup | `lookup.ts` | dictionaryapi.dev / Datamuse on click | CODE-READ-ONLY | E2E confirmed no call unless asked |
| Ghostwriter | `Ghostwriter.tsx`, `onAppend` | Mirror, highlight, push on checkbox | CODE-READ-ONLY | Not driven in browser |
| MH-3 Four passes & phase | `completeStage`, `isStageOpen`, `manuscriptPhase` | Ordered passes; Draft/Revision/Finalized | VERIFIED-TEST; developmental pass VERIFIED-E2E | store.test; `*-24-edit-after-run.png` (4 specialist notes, pass auto-finished) |
| MH-3 Model per pass | `modelForStage`, `EditModels` | Pass-specific model | VERIFIED-TEST | store.test "modelForStage…" |
| MH-3 Suggestion accept / reject | `Edit.tsx accept`, `replaceInHtml`, `snapshotChapter` | Snapshot then apply; pending never mutates | VERIFIED-TEST (not-found → null) ; BROKEN on duplicates/formatting (F04) | ai.test `BUG-ambiguous-match`, `BUG-format-loss` |
| MH-3 Developmental report, ask-the-editor, style guide | `DevelopmentalReport`, `styleGuides.ts` | Flags, jump, chat | Report VERIFIED-E2E; chat/style CODE-READ-ONLY | screenshot 24 |
| MH-3 Reports export / Export for editing (DOCX) | `exportStageReport`, `buildDraftDocx` | Markdown report; Word draft | DOCX VERIFIED-TEST; report CODE-READ-ONLY | pipelines.test "DOCX draft export" |
| MH-4 Format + preview | `Format`, `buildPreviewDocument`, `resolveFormat` | Preview = export | Preview renders VERIFIED-E2E; per-setting equality NOT verified | `*-20-format.png`; Low F24 |
| MH-4 AI preset | `requestFormatPreset` | AI picks preset | VERIFIED-TEST (mocked) | ai.test "format preset…" |
| MH-5 EPUB export | `buildEpub`, `downloadBlob` | EPUB 3, metadata, cover, order, no scrap | VERIFIED-TEST + VERIFIED-E2E (download unzipped) | pipelines.test; flow.spec "export EPUB". epubcheck NOT run |
| MH-7 Book Cover | `BookCover`, `generateCoverImage`, `CoverMockup`, `BookJacket` | Mockup, AI image, use as cover | CODE-READ-ONLY | Not driven |
| Import | `planImport`, `importManuscript`, `documents.ts` | txt/md/html/docx/epub | VERIFIED-TEST; EPUB re-import BROKEN (F10) | pipelines.test "import" |
| Translation | `createTranslation`, `translateChapter`, `proofreadTranslation`, `setChapterApproved` | Batched, tags kept, state machine | VERIFIED-TEST; sanitiser BROKEN (F02); new chapters MISSING (F11) | pipelines.test "translation" |
| Narration / audiobook | `speechPieces`, `synthesizeSpeech`, `buildAudiobook` | Chunks, one MP3 per chapter | VERIFIED-TEST (mocked) | pipelines.test "narration" |
| Keys: encrypt/revoke/delete/switch/migrate | `keyVault.ts` | AES-GCM, revoke wipes secret | VERIFIED-TEST; add key VERIFIED-E2E | keys-backup.test; flow.spec `addKey` |
| Providers (OpenAI, Anthropic, HF, Ollama, Ollama Cloud) | `askAi` | URL/headers/body; errors | VERIFIED-TEST (mocked shape only) | ai.test "provider requests" |
| Backup / restore | `createBackup`, `readBackup`, `restoreBackup` | Round trip, atomic, keys excluded | VERIFIED-TEST + VERIFIED-E2E | keys-backup.test; flow.spec "backup and restore" |
| Roadmap | `seedRoadmap`, `setRoadmapCardDone`, `advanceStage`, `stageFor` | Forward-only stage | VERIFIED-TEST; disagrees with edit workflow (F05) | store.test "roadmap" |
| Narrow viewport | layout | Usable at 375 px | VERIFIED-E2E (no horizontal overflow) | `*-26-narrow.png` |
| Collapsed sidebar | `SIDEBAR_KEY` | Icon-only | CODE-READ-ONLY | n/a |
| Service worker offline shell | `public/sw.js` | App opens offline | CODE-READ-ONLY | n/a |
| `ganger/reports/coverage.json` | integration.md | Machine-readable list | MISSING / DOC-MISMATCH | File does not exist |

## 4. Findings

Effort: S = under 2 h, M = half a day to 2 days, L = more.

**Status after fixes:** F01–F12 are **fixed** on `fix/high-findings` (see §8). F13–F27 are **open**, and F28 is new, found while fixing F09. The table below is the finding as originally recorded.

| ID | Sev | Title | Location | What happens | Repro / test | Suggested fix | Effort |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | High | No timeout on any AI / image / speech request | `src/lib/ai.ts:113-128`, `imageAi.ts`, `narration.ts:89` | A provider that never answers leaves the screen "Working…" forever, and there is no cancel | `ai.test › BUG-no-timeout` | `AbortController` with a timeout (e.g. 120 s) plus a Cancel button; map `AbortError` to a clear message | S |
| F02 | High | Translation sanitiser keeps `javascript:` URLs (and other dangerous attributes) | `src/lib/translate.ts:156-164` | AI-returned HTML such as `<a href="javascript:…">` is stored and later rendered/exported. The vault key is non-extractable but usable by any script in the page, so injected script could decrypt API keys | `pipelines.test › BUG-translate-js-href` | Allow-list tags/attributes (or DOMPurify); drop `href`/`src` unless http(s)/mailto; apply the same sanitiser to every AI→HTML path (Ghostwriter push) | S |
| F03 | High (unproven) | Moving a scene right after typing can duplicate it | `src/screens/Write.tsx:612-618` with `useChapterDraft` cleanup at `:87-90` | `moveSceneAction` writes the DB while the draft still holds unsaved scenes. The remount cleanup then flushes the old scene list back, so the scene ends up in both chapters | CODE-READ-ONLY; needs a fast typed-then-move E2E | Call `draft.flush()` before `moveSceneToChapter`, and drop the pending timer after a structural move | S |
| F04 | Medium | Accepting a suggestion is ambiguous and can strip formatting | `src/lib/text.ts:40-68`, `src/screens/Edit.tsx:471-487` | A passage that appears twice is applied to the first match without warning. A passage spanning `<em>`/`<strong>` rewrites the paragraph as plain text, losing all formatting. Snapshot, save, and status update are three separate writes (not atomic) | `ai.test › BUG-ambiguous-match`, `BUG-format-loss` | Refuse or ask on multiple matches (store a short context hash/offset); do range-based replacement across text nodes; wrap in one Dexie transaction | M |
| F05 | Medium | Progress is tracked in two places that disagree | `roadmap.ts advanceStage` vs `editing.ts completeStage` | Finishing all four edit passes ("Finalized") leaves the Roadmap at "outlining", and the Roadmap edit cards stay unticked | `store.test › BUG-two-sources` | Derive the roadmap edit cards from `editWorkflow` (or tick them in `completeStage`) | S |
| F06 | Medium | Unmigrated legacy plaintext keys go into backups | `src/lib/backup.ts:17,85-94` | If `migrateLegacyKeys` failed or has not run yet, settings `ai`/`imageAi` (plaintext keys) are written to the JSON backup | `keys-backup.test › BUG-legacy-key-in-backup` | Add `ai` and `imageAi` to `LOCAL_ONLY_SETTINGS` | S |
| F07 | Medium | Restoring an old (pre-v7) backup loses story info in the Universe | `src/lib/backup.ts:156-172` | `storyEntries` rows are restored, but the v7 migration never runs again, so the Universe is empty | `keys-backup.test › BUG-old-backup-universe` | After restore, convert `storyEntries` with no matching node, or bump `BACKUP_VERSION` and migrate on read | S |
| F08 | Medium | Inception lock bypassed by explicit `undefined` | `src/lib/store.ts:176-185` | `patchManuscript(id, { genre: undefined, type: undefined, status: undefined })` removes those fields (Dexie deletes keys set to undefined) | `store.test › BUG-lock-undefined` | Check `"genre" in changes` (not `!== undefined`) and drop undefined values for locked keys | S |
| F09 | Medium | Long chapters are silently truncated for editing passes | `src/lib/ai.ts:221` (`chapterText.slice(0, 24000)`), book context `slice(0, 8000)` | Text after about 4,000 words is never reviewed, and the author is not told | `ai.test › BUG-silent-truncation` | Split into batches like translation does, or warn in the UI | M |
| F10 | Medium | Re-importing the app's own EPUB adds the title page as a chapter and mangles headings | `src/lib/importManuscript.ts:102-120`, `epub.ts chapterHeadingHtml` | The import gives `["chapter","My Book"]` plus `"Chapter 1One"` (no separator between number and title) | `pipelines.test › BUG-epub-reimport` | Skip `epub:type="titlepage"`/copyright sections; read the heading title span separately | S |
| F11 | Medium | A translation never picks up chapters added to the original later | `src/lib/translate.ts:32-76` | Chapters are laid out only once, at creation | `pipelines.test › BUG-translation-new-chapters` | "Sync chapters" that adds missing `sourceChapterId`s | S |
| F12 | Medium | Multi-table deletes are not atomic | `src/db/schema.ts:529-571` | `deleteManuscript` recurses through children and translations in separate transactions; `deleteWorkspace` deletes books one by one. A failure midway leaves half-deleted data | CODE-READ-ONLY | One outer `db.transaction("rw", db.tables, …)` around the whole cascade | S |
| F13 | Medium | `npm test` now exists, and Ganger runs it after every round | `AGENTS.md` | The `it.fails` tests pass while bugs exist and fail once a bug is fixed. A fixer must flip `it.fails` → `it` for that BUG (this is intended, but Ganger's repair loop must know) | n/a | Document in AGENTS.md / PR | S |
| F14 | Low | Unbounded growth | `snapshotChapter` per accepted suggestion, `agentMessages`, `coverConcepts` (Blobs) | There is no cap or auto-prune (manual deletes exist) | CODE-READ-ONLY | Cap revisions per chapter (e.g. 50) and show storage use | M |
| F15 | Low | Translated chapters keep a `sourceChapterId` to a deleted chapter | `schema.ts deleteChapter` | Orphan link | `db.test › BUG-orphan-translation` | Clear or flag the link in `deleteChapter` | S |
| F16 | Low | Deleting the active workspace leaves the `activeWorkspaceId`/`activeManuscriptId` settings dangling | `schema.ts deleteWorkspace` | The UI falls back safely (`workspaces[0]`) | `db.test › BUG-dangling-settings` | Delete the settings in the cascade | S |
| F17 | Low | Backup summary counts settings, current-data summary does not | `backup.ts summarizeBackup/summarizeCurrent` | The "replace X with Y" confirmation numbers are off by the settings row count | `keys-backup.test › BUG-summary-mismatch` | Exclude settings in both | S |
| F18 | Low | `parseJson` breaks on a bracketed aside before the array | `ai.ts:181-192` | `"[Note] … [ … ]"` gives a format error | `ai.test › BUG-parsejson-brackets` | Try each candidate opening bracket, or strip fences first | S |
| F19 | Low | Corrupt .docx/.epub shows a raw JSZip error message | `documents.ts readDocx/readEpub` | "End of data reached…" instead of plain words | `pipelines.test › BUG-corrupt-zip-message` | Wrap `JSZip.loadAsync` in a friendly error | S |
| F20 | Low | Translation paragraph longer than `BATCH_CHARACTERS` is sent whole | `translate.ts batchesOf` | A 20k-char paragraph is one request (not a whole book, but over the stated limit) | `pipelines.test › BUG-oversized-paragraph` | Split long blocks by sentence | S |
| F21 | Low | No RTL support in EPUB | `epub.ts` | Arabic/Hebrew books get no `dir="rtl"` / `page-progression-direction` | pipelines.test "RTL language…" (documents current behaviour) | Set direction from language | S |
| F22 | Low | vite 6.4.4 moderate advisory | dependency | Dev server only | `npm audit` | `npm audit fix` | S |
| F23 | Low | Single 733 kB JS chunk | build | Slow first load | `vite build` warning | Lazy-load screens | M |
| F24 | Low | Console warning on Format preview: "Blocked script execution in about:srcdoc" | `Format.tsx:217` (`sandbox=""`) | Two warnings per preview, on dev and prod; the preview content itself has no script. Origin not identified | flow.spec (filtered) | Investigate; possibly harmless | S |
| F25 | Low | Committed `package.json` lacks `allowScripts` for esbuild; no `engines` field | `package.json` | npm 11 warns on every install; the user's uncommitted copy already has the fix | `audit-logs/npm-ci.txt` | Commit `allowScripts`; add `"engines": {"node": ">=22"}` | S |
| F26 | Low | Stale or contradictory docs | `ganger/brain/decisions.md:3` ("Backend: yes. People sign in"), `docs/data-model.md` (ApiKey "OpenAI or Anthropic" only; relationships omit universeNodes/researchNotes/roadmapCards/storyEntries), `docs/integration.md:3` (references missing `ganger/reports/coverage.json`) | Docs describe features or a stack that do not exist | n/a | Update docs (ganger/brain is read-only per AGENTS.md, so flag it upstream) | S |
| F27 | Low | Dead `storyEntries` table after v7 | `schema.ts` | Rows are kept forever; `deleteManuscript` still clears them | db.test (asserted) | Drop or clear in a v8 upgrade | S |
| F28 | Medium (new) | Developmental editors do not read the book | `src/lib/developmentalReview.ts:83-98,118` | The "whole book" sent to the four developmental editors is a summary: the outline plus the **first 240 characters of each chapter**, capped at 30,000 characters. docs/integration.md says they "read the whole book". Notes about plot, pacing or character are made without the text | CODE-READ-ONLY (found while fixing F09) | Product decision: per-chapter summaries made first by the AI (cheap) or full chapters in parts (costly). Either way, fix the doc claim | M |

## 5. What could not be verified, and why
- **Real provider behaviour.** No real keys were used, by design. Not verified: model IDs (`gpt-6.1-sol`, `claude-fable-5-1`, etc. in `src/lib/providers.ts`), whether each provider allows direct browser CORS (Hugging Face router and Ollama Cloud are especially doubtful), whether Ollama Cloud really serves `/v1/chat/completions` at `https://ollama.com`, Gemini image request shape, and real 429/5xx bodies.
- **epubcheck** was not installed (it needs Java). The EPUB structure was checked by hand in tests: mimetype first and stored, container.xml, OPF manifest/spine consistency, the nav item, and metadata.
- **Phase 3 flows not driven in the browser:** series volume switching, Universe UI (kinds, tags, artwork), chapter drag-and-drop UI, Ghostwriter mirror/push, Book Cover generation and jacket, the Translate screen UI, the audiobook download UI, key revoke/delete UI, collapsed sidebar, and closing and reopening a persistent browser profile (the tests use a fresh context; persistence was checked through reloads only). Line/copy/proofread passes with different mocked models per pass were covered in unit tests, not E2E.
- **F03** (scene-move duplication) was found by reading the code. It is not reproduced yet.
- **Linting** was not run (no config; a throwaway ESLint setup was not added).
- **Electron packaging** (`ganger-release/`) was not built or run.
- **Windows install note:** `npm ci` fails with EPERM while a dev server from the same checkout is running, because the server keeps lightningcss's native `.node` file open. The audit was done in a separate git worktree for that reason.
- **Fixes verified by unit tests only (not clicked through in a browser):** F03 scene move, F04 accepting a suggestion, F07 restore of an old backup, F09 long chapters, F10 import, F11 the Translate screen's sync. F05 was also checked in the browser (screenshot `*-24b-roadmap-after-dev-pass.png`). F01 was tested with fake timers, not against a real stalled provider.

## 6. Test inventory

| File | Covers | Tests |
| --- | --- | --- |
| `tests/unit/db.test.ts` | v1→v7 and v6→v7 migrations; cascade deletes for manuscript/workspace/chapter/outline/universe | 9 |
| `tests/unit/store.test.ts` | Inception lock, roadmap stage, edit workflow and phase, model per pass, chapter/scene moves, scrap bin | 14 |
| `tests/unit/ai.test.ts` | parseJson; OpenAI/Anthropic/HF/Ollama/Ollama Cloud request shape; 401/429/500/empty/offline/network/timeout; consumers; replaceInHtml | 26 |
| `tests/unit/keys-backup.test.ts` | Vault encrypt/revoke/delete/switch/migrate; backup exclusion, round trip with Blobs and Unicode, rejection, atomic restore | 15 |
| `tests/unit/pipelines.test.ts` | EPUB structure/metadata/order/cover/scrap, DOCX, import (5 formats, own-output round trip, corrupt, unsupported), translation (state machine, batching, failure, sanitiser), narration | 18 |
| `tests/unit/sanitize.test.ts` (fixes branch) | Sanitiser: dangerous elements/attributes removed, disguised `javascript:`/`data:`/`vbscript:` rejected, http/https/mailto/relative kept | 4 groups (11 cases) |
| `tests/e2e/flow.spec.ts` | Gating, write/autosave/reload/quick reload, Unicode, EPUB download, Format preview, offline editing, add key, mocked developmental pass, backup and restore, narrow viewport; asserts no unexpected outbound requests | 2 × (dev, preview) |

Run them:
```bash
npm test
```
```bash
npx playwright install chromium
```
```bash
npm run test:e2e
```
Status on `audit/baseline`: **82/82 unit tests pass**, 17 of them `it.fails` tests named `BUG-*` that reproduce defects. **4/4 E2E tests pass.**

Status on `fix/high-findings`: **104/104 unit tests pass.** 11 `BUG-*` tests were turned into ordinary tests as their bugs were fixed. **6 remain**, all for Low findings: `BUG-parsejson-brackets`, `BUG-dangling-settings`, `BUG-orphan-translation`, `BUG-summary-mismatch`, `BUG-corrupt-zip-message`, `BUG-oversized-paragraph`. **4/4 E2E tests pass**, and the E2E flow now also checks that the Roadmap follows a finished edit pass. `tsc --noEmit` is clean.

How the `BUG-*` tests work: `it.fails` passes while the assertion fails, so the suite stays green while a bug exists. Once someone fixes the bug, that test turns red. That is the signal to rename it and switch it to `it`, and it is how each fix in §8 was proven. Network is mocked at `fetch` (unit) and with `page.route` (E2E); nothing reaches the internet.

## 7. Prioritised fix plan
Items 1–8 are done on `fix/high-findings` (§8).
1. ~~**F02** sanitise all AI-returned HTML. **F06** exclude legacy key settings from backups.~~ Done.
2. ~~**F01** request timeouts for AI, image, and speech.~~ Done (a Cancel button is still to do).
3. ~~**F03** flush the draft before structural scene moves.~~ Done (E2E repro still to write).
4. ~~**F04** safe suggestion application.~~ Done.
5. ~~**F12** atomic cascades; **F08** close the lock bypass.~~ Done.
6. ~~**F05** one source of truth for progress.~~ Done.
7. ~~**F09** batch long chapters for edit passes.~~ Done.
8. ~~**F07 / F10 / F11** backup, import, and translation correctness.~~ Done.
9. **F28** decide how the developmental editors should see the book, and correct the docs.
10. Low items: F15–F21 data hygiene and UX; F22/F25 dependency and install hygiene; F14 storage caps; F23 code-splitting.
11. **F26** refresh the docs, and record in AGENTS.md how the `BUG-*` `it.fails` tests work (F13). Then drive the remaining Phase 3 flows (§5) in Playwright.

## 8. Fixes applied (branch `fix/high-findings`)

Each fix below was made the same way: the finding's `BUG-*` test (or a new test) was confirmed failing for the right reason, the fix was made, the test was switched to an ordinary `it`, and the full unit suite, `tsc --noEmit` and (where the UI changed) the E2E suite were run. For the F12 atomicity tests we also ran them against the **old** code to make sure they fail there. One of them first passed on the old code, and was corrected before it counted.

Diff from `audit/baseline`: 17 files under `src/`, +433 / −148 lines.

| Finding | Commit | Files |
| --- | --- | --- |
| F01, F02 (structure), F03, F06 | `37c92c2` | `src/lib/request.ts` (new), `src/lib/sanitize.ts` (new), `ai.ts`, `imageAi.ts`, `narration.ts`, `translate.ts`, `backup.ts`, `screens/Write.tsx` |
| F02 (URL allow-list) | `3ac68cf` | `src/lib/sanitize.ts` |
| F04 | `7f89928` | `src/lib/text.ts`, `screens/Edit.tsx` |
| F08, F12 | `b93fe2f` | `src/db/schema.ts`, `src/lib/store.ts` |
| F05 | `0f934f4` | `src/db/schema.ts`, `src/lib/roadmap.ts`, `src/lib/editing.ts`, `screens/Roadmap.tsx` |
| F09 | `0ff91f6` | `src/lib/ai.ts` |
| F07, F10, F11 | `46de982` | `src/db/schema.ts`, `backup.ts`, `documents.ts`, `translate.ts`, `screens/Translate.tsx` |

### F01: request timeouts (High)
- **Cause.** Every provider call was a bare `fetch` with no `AbortController`. A provider that accepted the connection and never answered left the screen on "Working…" forever.
- **Fix.** New `fetchWithTimeout(what, url, init, timeoutMs = 120_000)` in `src/lib/request.ts`. It aborts after the time limit and throws `RequestTimeoutError` ("The AI provider did not answer within 120 seconds. Try again, or pick a faster model.").
- **Design point.** The response **body** is read inside the time limit, then handed back as a new `Response`. Without that, a provider that sends headers and then stalls mid-body would still hang the caller at `response.json()`. Statuses 204/205/304 are rebuilt with a null body, as the `Response` constructor requires.
- **Wiring.** All six provider calls use it: chat in `ai.ts` (OpenAI, Anthropic, HF, Ollama, Ollama Cloud), OpenAI and Gemini images plus the image-URL download in `imageAi.ts`, and speech in `narration.ts`. Each caller's existing `catch` turned any error into "Could not reach…". They now re-throw `RequestTimeoutError` first, so the author sees the accurate message. The dictionary lookup (`lookup.ts`) was left alone: it isn't an AI call.
- **Tests.** `ai.test › F01` uses fake timers and a fetch mock that rejects on abort, as real fetch does.
- **Not done.** A Cancel button. The timeout is a safety net, not a substitute for letting the author stop a request.

### F02: sanitising AI-returned HTML (High, security)
- **Cause.** `translate.ts` had a private `sanitize()` that removed scripts and `on*` handlers but kept `href`/`src` as-is, so `<a href="javascript:…">` from the AI was stored and rendered. In this app that matters more than usual: the API-key vault key is non-extractable, but any script running in the page can still *use* it to decrypt the keys.
- **Fix.** New shared module `src/lib/sanitize.ts`, which `translateChapter` now uses:
  - `sanitizeDocument(doc)` / `sanitizeHtml(html)` remove `script, style, iframe, frame, object, embed, link, meta, base, form, input, button, textarea, select, svg, math, template`, all `style` and `on*` attributes, and any URL-bearing attribute (`href, src, xlink:href, action, formaction, srcset, poster, background`) whose value fails `isSafeUrl`.
  - `isSafeUrl(value)` is an **allow-list**. It first removes characters U+0000–U+0020 and U+007F–U+009F and lower-cases the value, because browsers ignore those inside a scheme ("java\nscript:" runs). An address with no scheme (relative, or `#anchor`) is allowed. Otherwise only `http`, `https` and `mailto` pass; everything else, including schemes nobody has invented yet, is dropped. Entity-encoded tricks (`&#106;avascript:`) are already decoded by the HTML parser before the check.
  - Only the address is dropped, not the element: `<a href="javascript:…">Click</a>` becomes `<a>Click</a>`, so the translated text survives.
- **Scope checked.** The Ghostwriter's "push to scene" already escapes its text (`escapeHtml`), so translation was the only path storing AI HTML. EPUB export (`toXhtmlBody`) was deliberately not changed: it runs on the author's own chapters, and applying the URL rule there could strip `src` from images the author added.
- **Tests.** `tests/unit/sanitize.test.ts` (11 cases, including disguised schemes) and `pipelines.test › F02`.

### F03: scene duplicated after a fast move (High; found by reading the code)
- **Cause.** In `Write.tsx` the chapter draft saves 600 ms after the last keystroke. "Move scene to…" wrote the database straight away while a save was still pending. The draft's unmount cleanup then flushed its stale scene list, which still contained the moved scene, back into the source chapter.
- **Fix.** The scene card's `onMoveScene` callback now runs `draft.flush()` first, then the move. `flush()` clears the pending timer, so the cleanup has nothing left to write.
- **Verification.** Code reading plus the existing `moveSceneToChapter` unit test. **No browser test reproduces the original race yet**; one is listed in §5.

### F04: applying a suggestion (Medium)
- **Cause.** `replaceInHtml` edited the first match it found. If the passage crossed formatting, it rewrote the whole paragraph as plain text, losing bold, italics and links. `accept()` then did snapshot, save and status update as three separate writes, and read the chapter currently open on screen rather than the suggestion's own chapter.
- **Fix in `src/lib/text.ts`.** `replaceInHtml` now returns `{ ok: true, html } | { ok: false, reason: "missing" | "ambiguous" }`.
  - **Counting.** It counts every match, overlapping ones included, across all innermost block elements (`p, h1–h6, li, blockquote, div`; the body itself for bare text). More than one match gives `"ambiguous"`, and nothing is changed.
  - **Range replacement.** For a unique match, `pointAt()` maps the paragraph-level text offsets onto the underlying text nodes. A DOM `Range` deletes exactly those characters and the replacement goes in at the start. Formatting outside the matched characters is untouched. At a boundary between two text nodes, the range start goes to the next node and the end to the previous one, so neighbouring formatting isn't swallowed. Empty inline wrappers left by the deletion (e.g. `<em></em>`) are removed, then `normalize()`.
  - Non-breaking spaces are matched as spaces, because the AI is given text from `htmlToText`, which converts them.
- **Fix in `Edit.tsx`.** `accept()` runs read → `replaceInHtml` → `snapshotChapter` → `saveChapter` → status update inside one `db.transaction("rw", chapters, revisions, suggestions)`, using `s.chapterId`. The screen now shows a separate message for an ambiguous passage.
- **Tests.** `ai.test › F04` (duplicates, overlaps, crossing formatting, deletion, NBSP, emoji, Arabic, scene sections, bare text).

### F05: Roadmap and edit workflow disagreed (Medium)
- **Cause.** Edit progress lived in `manuscripts.editWorkflow` and Roadmap progress in `roadmapCards.done`, and nothing linked them. A book could be "Finalized" in Edit and still be at "outlining" on the Roadmap.
- **Fix.** The edit passes are now the single source of truth, and the four edit cards are a view of them.
  - `RoadmapCard.editStage?: EditStage` is a new, unindexed field, so no schema version bump is needed. New books get it on their four edit cards (`FIRST_CARDS`).
  - New `syncEditCards(manuscriptId)` in `roadmap.ts` sets each linked card's `done` to "is its pass completed", then calls `advanceStage`. It can run any number of times safely. It is called after every workflow change (`save()` in `editing.ts`) and every time the Roadmap opens (via `seedRoadmap`).
  - **Older books.** The seeded branch of `seedRoadmap` links edit cards that have no `editStage` by matching their original title, then syncs. After that the title no longer matters.
  - `setRoadmapCardDone` ignores linked cards, and the Roadmap shows them disabled with a "Follows Edit" label.
- **Behaviour to note.** The stage still follows the Roadmap's existing rule (the first column with an unticked required card) and still never moves backwards. Finishing all passes reaches "formatting" only if the Write cards are ticked too.
- **Tests.** Four `store.test › F05` tests (tick/untick, stage advance with no regression, manual tick refused, legacy linking) and an E2E check after the developmental pass.

### F06: plaintext keys in backups (Medium, security)
- **Cause.** Old versions kept API keys in plain text under settings `ai` / `imageAi`. `migrateLegacyKeys` moves them into the encrypted vault, but if it failed or hadn't run yet, `collectBackup` exported them.
- **Fix.** `LOCAL_ONLY_SETTINGS` in `backup.ts` now also covers `ai` and `imageAi`. They are never written to a backup, and a restore never overwrites this computer's copies.
- **Tests.** `keys-backup.test › F06`.

### F07: old backups and the Universe (Medium)
- **Cause.** The v7 database upgrade turned `storyEntries` into `universeNodes`, but upgrades run only once. Restoring a backup made before v7 put the entries back without converting them, so the Universe stayed empty.
- **Fix.**
  - The conversion is now one exported function, `storyEntryToNode()` in `schema.ts`, used by the v7 upgrade and by `restoreBackup`.
  - After restoring, if the backup has **no `universeNodes` table at all** (a genuinely pre-v7 file), its story entries are converted inside the same restore transaction.
  - Newer backups are deliberately left alone. Old entries survive in `storyEntries` after the upgrade (see F27), so converting on every restore would bring back Universe nodes the author had since deleted.
- **Tests.** Two `keys-backup.test › F07` tests, including the no-resurrection case.

### F08: inception lock bypass (Medium)
- **Cause.** The lock checks in `patchManuscript` used `next.genre !== undefined`. Dexie's `update` treats a property set to `undefined` as "delete this field", so `patchManuscript(id, { genre: undefined })` slipped past the check and erased the locked value.
- **Fix.** The checks now test whether the key is present (`"genre" in next`). An explicit `undefined` for `type`, `targetWordCount`, `genre` or `status` counts as an attempted change and is dropped.
- **Tests.** `store.test › F08`.

### F09: long chapters truncated in edit passes (Medium)
- **Cause.** `requestStageReview` sent `chapterText.slice(0, 24000)`, so text after roughly 4,000 words was never reviewed, and the author wasn't told.
- **Fix.**
  - New `chapterParts(text, limit)` in `ai.ts` (`CHAPTER_PART_CHARACTERS = 24000`) splits only at paragraph breaks. Line, copy and proofreading suggestions must quote from one paragraph (and F04 only applies within a paragraph), so a quotable passage never straddles two parts. A single paragraph over the limit is cut at the last ". ", "! " or "? " in range, else at a space, else hard.
  - Each part is its own request, labelled "part i of n; the other parts are reviewed separately". Edits from all parts are merged, and one failing part fails the whole review, so suggestions from only part of a chapter are never saved. A short chapter still makes exactly one request.
  - The translation proofreader uses the same function, so it is covered too.
- **Tests.** Three `ai.test` tests (every paragraph sent exactly once, merge and failure, splitting rules).
- **Related, not fixed.** F28: the developmental review works from a summary, not the full text.

### F10: re-importing an EPUB (Medium)
- **Cause.** The importer turned the title page into a chapter. It also read `<h1><span class="chapnum">Chapter 1</span>One</h1>` with `textContent`, giving "Chapter 1One", which the chapter-title parser couldn't split.
- **Fix in `documents.ts`, in the importer rather than the exporter,** so the app's existing exports and other publishers' EPUBs (which often use the same heading layout) also import correctly.
  - `readEpub` skips spine items marked `epub:type` `cover`, `titlepage` or `copyright-page`, or named `cover`, `title(-)page` or `copyright`. The app regenerates those on export.
  - New `headingText()`: when a heading's first child is "Chapter/Part/Book N" and more text follows, it returns "Chapter N: Title". Other headings keep plain `textContent`, so inline formatting such as `H<em>ello</em>` isn't split with a space.
- **Tests.** `pipelines.test › F10`. A round trip of the app's own EPUB now gives exactly Dedication / One / Two / About the Author.

### F11: translations missed chapters added later (Medium)
- **Cause.** `createTranslation` laid out one chapter per original chapter once, at creation, and never again.
- **Fix.**
  - New `syncTranslationChapters(translationId)` in `translate.ts`, run in one transaction. It adds an empty `pending` chapter for each original chapter that has no counterpart (Scrap bin excluded), and moves existing counterparts to their original's section and position.
  - Translated or approved text is never touched, and running it again adds nothing.
  - `TranslateBody` runs it whenever the active translation changes.
- **Tests.** Two `pipelines.test › F11` tests.

### F12: non-atomic cascade deletes (Medium)
- **Cause.** `deleteManuscript` deleted a series' books and a book's translations recursively, each in **its own** transaction, and `deleteWorkspace` deleted books one at a time. A failure midway left half-deleted data.
- **Fix in `schema.ts`.**
  - The body moved into `removeManuscript()`, which opens no transaction of its own.
  - `deleteManuscript` and `deleteWorkspace` each open **one** `rw` transaction over every manuscript table (`manuscriptTables()`, plus `workspaces`) and call it. Dexie lets a nested operation join an outer transaction that already covers its tables, so the whole cascade commits or rolls back as one.
  - A book reached twice (e.g. a series book that is also a translation) is skipped the second time.
- **Tests.** Two `db.test › F12` tests make a lookup throw partway through, then check that every row count is unchanged. Both fail against the old code.

## 9. Notes for the Ganger team

Observations from fixing this codebase that may be useful for the generator rather than for this one app. They are offered as patterns we saw, not as a judgement on the tooling.

1. **"Passes `tsc` and `vite build`" was a weak signal here.** The code was type-clean with no `any`, no TODOs and no `console` calls, yet 28 findings were real behavioural defects that only tests or a browser run could show. The project had no `test` script at all. We suggest generating a minimal Vitest + fake-indexeddb setup on day one, plus at least one browser smoke test, and checking behaviour, not just compilation, before a round is marked done.
2. **Every outbound call needs the same four things.** A timeout, a distinct timeout error, offline handling, and parse-error handling. The generated code had the last two but not the first two, at all six call sites. A single shared request helper in the template would prevent this class of bug.
3. **Untrusted HTML needs one shared sanitiser with an allow-list.** The generated sanitiser was a local deny-list that missed URL attributes. Any feature that puts model output into `innerHTML` should be required to use the shared helper.
4. **Multi-table writes should be one transaction by default.** Cascade deletes and "snapshot, save, mark accepted" were sequences of separate writes. Dexie makes this cheap: a nested call joins an outer transaction that covers its tables.
5. **Dexie treats an explicit `undefined` as "delete this field".** Guards written as `!== undefined` silently let callers erase fields. Check with `in`, or strip undefined keys before `update`.
6. **Watch for two records of one fact.** Progress was tracked in `editWorkflow` and in `roadmapCards.done` with nothing linking them. The pattern that worked: pick one owner and make the other a view that is recomputed and safe to recompute any number of times.
7. **Migrations run once; backups live forever.** Any data move done in a schema `upgrade()` should also be applied when an older backup is restored. Factor the mapping into one function used by both.
8. **Silent caps.** `slice(0, N)` on user text appeared in several prompts (24,000 per chapter, 30,000 for the whole book, 240 per chapter in the developmental summary). Each either needs batching or must be visible to the author. One of them (F28) changes what a feature actually does.
9. **Docs drifted from the code.** `decisions.md` still describes a backend with sign-in; `data-model.md` lists two key providers instead of five and omits four tables; `integration.md` points to `ganger/reports/coverage.json`, which doesn't exist; and the developmental review is described as reading "the whole book" (F28). AGENTS.md says `ganger/brain/` must not be edited by the project, so these need correcting upstream.
10. **The test script will now run after every round.** The `BUG-*` tests are written with `it.fails`, so they pass while their bug exists and fail once it is fixed. If a Ganger round fixes one of the six remaining bugs, that test turning red is expected, and the right repair is to switch it to `it`, not to change the code back. This is finding F13. We recommend adding a line to AGENTS.md saying so.
