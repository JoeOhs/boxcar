# Boxcar Publishing Studio: Baseline Audit

Branch: `audit/baseline` (from `main` @ `33b6585`, "Release v1.0.2"). Date: 2026-11-09.
No application source under `src/` was modified. Raw command output is in `audit-logs/`, and browser screenshots are in `audit-logs/e2e/`.

## 1. Executive summary

The app is in better shape than its build history suggests. It type-checks, builds, and installs cleanly. The core local data paths work under real tests and in a real browser: workspaces, manuscripts, chapters, cascade deletes, the inception lock, roadmap stage logic, the four-pass edit workflow, key encryption, backup/restore (atomic, Blob-safe, keys excluded), EPUB/DOCX export, import of txt/md/html/docx/epub, translation batching, and audiobook assembly. Two things are missing everywhere: hardening at the edges and a single source of truth. No AI/image/speech request has a timeout. Text that comes back from the AI translator is only partly sanitised. A scene-move race can duplicate text. Suggestions are applied to the first matching passage and can strip formatting. The Roadmap stage and the edit workflow track progress separately and disagree. Several documents describe a different app (a backend, auth, missing report files). Nothing was verified against real AI providers. All provider behaviour here is mocked, and the model IDs in `src/lib/providers.ts` were not checked against real APIs.

| Severity | Count |
| --- | --- |
| Critical | 0 |
| High | 3 |
| Medium | 9 |
| Low | 15 |

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

## 5. What could not be verified, and why
- **Real provider behaviour.** No real keys were used, by design. Not verified: model IDs (`gpt-6.1-sol`, `claude-fable-5-1`, etc. in `src/lib/providers.ts`), whether each provider allows direct browser CORS (Hugging Face router and Ollama Cloud are especially doubtful), whether Ollama Cloud really serves `/v1/chat/completions` at `https://ollama.com`, Gemini image request shape, and real 429/5xx bodies.
- **epubcheck** was not installed (it needs Java). The EPUB structure was checked by hand in tests: mimetype first and stored, container.xml, OPF manifest/spine consistency, the nav item, and metadata.
- **Phase 3 flows not driven in the browser:** series volume switching, Universe UI (kinds, tags, artwork), chapter drag-and-drop UI, Ghostwriter mirror/push, Book Cover generation and jacket, the Translate screen UI, the audiobook download UI, key revoke/delete UI, collapsed sidebar, and closing and reopening a persistent browser profile (the tests use a fresh context; persistence was checked through reloads only). Line/copy/proofread passes with different mocked models per pass were covered in unit tests, not E2E.
- **F03** (scene-move duplication) was found by reading the code. It is not reproduced yet.
- **Linting** was not run (no config; a throwaway ESLint setup was not added).
- **Electron packaging** (`ganger-release/`) was not built or run.
- **Environment side effect:** the first `npm ci` ran in `boxcar/` while the user's `npm run dev` was holding a file. The install failed partway and left `boxcar/node_modules` incomplete. I did not stop the user's dev server. Run `npm ci` again in `boxcar/` after stopping it. All audit work was done in the worktree `../boxcar-audit`.

## 6. Test inventory

| File | Covers | Tests |
| --- | --- | --- |
| `tests/unit/db.test.ts` | v1→v7 and v6→v7 migrations; cascade deletes for manuscript/workspace/chapter/outline/universe | 9 |
| `tests/unit/store.test.ts` | Inception lock, roadmap stage, edit workflow and phase, model per pass, chapter/scene moves, scrap bin | 14 |
| `tests/unit/ai.test.ts` | parseJson; OpenAI/Anthropic/HF/Ollama/Ollama Cloud request shape; 401/429/500/empty/offline/network/timeout; consumers; replaceInHtml | 26 |
| `tests/unit/keys-backup.test.ts` | Vault encrypt/revoke/delete/switch/migrate; backup exclusion, round trip with Blobs and Unicode, rejection, atomic restore | 15 |
| `tests/unit/pipelines.test.ts` | EPUB structure/metadata/order/cover/scrap, DOCX, import (5 formats, own-output round trip, corrupt, unsupported), translation (state machine, batching, failure, sanitiser), narration | 18 |
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
Current status: **82/82 unit tests pass** (17 are `it.fails` tests named `BUG-*` that reproduce defects; each turns red once its bug is fixed, and should then be switched to `it`). **4/4 E2E tests pass.** Network is mocked at `fetch` (unit) and with `page.route` (E2E); nothing reaches the internet.

## 7. Prioritised fix plan
1. **F02** sanitise all AI-returned HTML (security). Then **F06** exclude legacy key settings from backups.
2. **F01** request timeouts and cancel for AI, image, and speech.
3. **F03** flush the draft before structural scene moves; add an E2E repro first.
4. **F04** safe suggestion application (ambiguity check, formatting-preserving replacement, one transaction).
5. **F12** atomic cascades; then **F08** close the lock bypass.
6. **F05** one source of truth for progress (roadmap ↔ edit workflow).
7. **F09** batch long chapters for edit passes, or warn.
8. **F07 / F10 / F11** backup, import, and translation correctness.
9. Low items: F15–F21 data hygiene and UX; F22/F25 dependency and install hygiene; F14 storage caps; F23 code-splitting.
10. **F26** refresh the docs, and record in AGENTS.md how the `BUG-*` `it.fails` tests work (F13). Then drive the remaining Phase 3 flows (§5) in Playwright.
