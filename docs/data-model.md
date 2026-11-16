# Data model

Storage is IndexedDB through Dexie, entirely on the author's machine (no accounts, no server). The schema is in `src/db/schema.ts`. All ids are UUID strings made by `newId()`; timestamps are milliseconds since epoch. IndexedDB has no foreign keys, so `deleteWorkspace`, `deleteManuscript`, `deleteChapter` and `deleteOutlineItem` in that file clean up children.

Relationships: `Workspace 1-* Manuscript`; `Manuscript 1-* OutlineItem`, `Chapter`, `AgentMessage`, `CoverConcept`, `UniverseNode`, `ResearchNote`, `RoadmapCard`; `Chapter 1-* Revision`, `Suggestion`; `OutlineItem *-0..1 Chapter`; `Manuscript (series) 1-* Manuscript` through `seriesId`; `Manuscript 1-* Manuscript (translation)` through `translationOf`, with each translated `Chapter` pointing at its original through `sourceChapterId`. Deleting an original chapter keeps its translations: the link is removed and the translated chapter is flagged `sourceDeleted`, which the Translate screen shows as “Original deleted”.

Deletes that touch several tables (`deleteWorkspace`, `deleteManuscript` and their children) run inside one Dexie transaction, so a failure part-way leaves nothing half-deleted.

## Workspace
One author or pen name. It stores the pen name, a short bio and timestamps. It exists so manuscripts are organised by who they are published under; the pen name is also what goes into the epub author field. Every manuscript belongs to exactly one workspace.

## Manuscript
One book inside a workspace. It stores the title, subtitle, description, language, ISBN, keywords, copyright line, status (outlining, drafting, editing, formatting, ready), a target word count, an optional genre (`genre`, the id of a genre in `src/lib/genres.ts`, fiction or non-fiction), an optional cover image, the Book Cover workshop brief (`coverBrief`) and the time of the last export. These are the fields Amazon KDP and the epub package metadata need. It also embeds the book's format settings (see below), which keeps format one-to-one with the book without a separate table.

### FormatSettings (embedded in Manuscript, not a table)
Font family, size, line height, paragraph style (indent or block), chapter heading style, scene-break text, drop caps, table of contents on/off and trim size. The format step edits these, and the preview and the export both read them, so what the author sees is what is exported.

## OutlineItem
A node in the outline workshop, a tree built with `parentId` and ordered among siblings by `order`. `kind` is act, chapter, scene or beat; each has a title, a summary and free notes. A node may link to the `Chapter` that holds its written text through `chapterId`, so the plan and the draft stay connected. It is separate from `Chapter` because an outline holds structure at any depth and exists before any prose does.

## Chapter
One written section of the book, either front matter, a chapter or back matter (`kind`). It stores the title, the text as HTML (what the editor produces and what the epub is built from), a word count, a status (draft, revised, final) and its `order` in the book. Export reads the chapters of a manuscript in `order`, front matter first and back matter last. `devSummary` (optional) is the AI summary the developmental editors read in place of the full text: its text, a fingerprint of the chapter text it was made from (a different fingerprint means it is stale and is redone at the next developmental pass) and when it was made. It is not an index, so adding it needed no new database version.

## Revision
A saved copy of a chapter's title and text with a label such as "Before AI edit". It supports editing: the author can snapshot a chapter before changing it, compare versions and restore an old one. It also guards against an AI suggestion being applied badly.

## Suggestion
A proposed edit to a passage in a chapter: the original text, the replacement and a comment explaining why. It comes from the author (`source: user`) or from an AI role (`source: ai`, with `role`), and is pending, accepted or rejected. This is how editing works as a review: nothing from the AI changes the text until the author accepts it.

## AgentMessage
One message in the conversation between the author and an AI role (outliner, editor, proofreader, formatter or ghostwriter) about a manuscript. It stores the role, whether the author or the agent wrote it, the text and the time. The AI staff are the "publishing company roles"; keeping the history per manuscript lets each role carry on where it left off, including offline (past conversations stay readable without a connection).

## CoverConcept
One cover picture made by the Book Cover workshop (added in database version 2). It stores the manuscript it belongs to, the prompt sent, the image provider and model, the image itself as a Blob and the time. Concepts are kept so the author can compare them; "Use as cover" copies one onto `Manuscript.cover`.

## Setting
A key/value row for app-wide preferences. API keys are no longer kept here: see `ApiKey` below. Keys are `editModels`, `keyVaultKey` (the non-extractable AES-GCM key that encrypts the API keys), `activeKey:text` and `activeKey:image` (which stored key is in use), the active workspace and manuscript, and theme.

## ApiKey (table `apiKeys`)
One API key the author entered, for the AI staff and Ghostwriter (`kind` "text": OpenAI, Anthropic, Hugging Face, Ollama on this computer, or Ollama Cloud; a local Ollama needs no secret) or the Book Cover workshop (`kind` "image": OpenAI or Google Gemini). It holds the provider, model, the last four characters, a status (active or revoked), the dates, and `secret`: the key encrypted with AES-GCM. The plain key is never stored. Revoking wipes `secret` and keeps the row; deleting removes it. The decrypted key exists only in memory when a request is sent to the chosen provider.

## UniverseNode (table `universeNodes`)
One wiki page in the Universe screen (database version 7): a character, location, situation, concept, item, faction or event. It stores a name, a short summary, tags (which set its colour and group related nodes), a list of free fields such as "Clothing preferences", links to other nodes, and an optional image (uploaded or made by the image AI). It replaced `StoryEntry`: the version 7 upgrade copied every story entry into a node, and restoring an older backup runs the same conversion.

## ResearchNote (table `researchNotes`)
One item in a manuscript’s research repository (database version 4): a note, a web link or an imported file’s text. `shareWithGhostwriter` decides whether the Ghostwriter reads it as background for the book.

## RoadmapCard (table `roadmapCards`)
One task card on the Roadmap board (database version 4). Columns are the manuscript stages. A card may name the screen that does the task, may be optional (it does not hold up its stage), and may stand for an editing pass (`editStage`). Cards for editing passes are not ticked by hand: they follow `Manuscript.editWorkflow`, which is the single record of editing progress.

## StoryEntry (table `storyEntries`)
Story info for a book: characters, locations and situations, each with a name and a description (database version 6). It is still in use: the Story info panel on the Universe screen’s Outline tab reads and writes it, and the outliner AI is given these entries as context. When database version 7 created the Universe, every story entry was copied into a `UniverseNode`; entries added since then live only here, so the same kind of fact can be recorded in two places (see AUDIT_REPORT.md F27, which wrongly calls this table dead). Restoring a backup made before version 7 copies its entries into the Universe the same way.