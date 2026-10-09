# Data model

Storage is IndexedDB through Dexie, entirely on the author's machine (no accounts, no server). The schema is in `src/db/schema.ts`. All ids are UUID strings made by `newId()`; timestamps are milliseconds since epoch. IndexedDB has no foreign keys, so `deleteWorkspace`, `deleteManuscript`, `deleteChapter` and `deleteOutlineItem` in that file clean up children.

Relationships: `Workspace 1-* Manuscript`; `Manuscript 1-* OutlineItem`, `Chapter`, `AgentMessage`, `CoverConcept`; `Chapter 1-* Revision`, `Suggestion`; `OutlineItem *-0..1 Chapter`.

## Workspace
One author or pen name. It stores the pen name, a short bio and timestamps. It exists so manuscripts are organised by who they are published under; the pen name is also what goes into the epub author field. Every manuscript belongs to exactly one workspace.

## Manuscript
One book inside a workspace. It stores the title, subtitle, description, language, ISBN, keywords, copyright line, status (outlining, drafting, editing, formatting, ready), a target word count, an optional genre (`genre`, the id of a genre in `src/lib/genres.ts`, fiction or non-fiction), an optional cover image, the Book Cover workshop brief (`coverBrief`) and the time of the last export. These are the fields Amazon KDP and the epub package metadata need. It also embeds the book's format settings (see below), which keeps format one-to-one with the book without a separate table.

### FormatSettings (embedded in Manuscript, not a table)
Font family, size, line height, paragraph style (indent or block), chapter heading style, scene-break text, drop caps, table of contents on/off and trim size. The format step edits these, and the preview and the export both read them, so what the author sees is what is exported.

## OutlineItem
A node in the outline workshop, a tree built with `parentId` and ordered among siblings by `order`. `kind` is act, chapter, scene or beat; each has a title, a summary and free notes. A node may link to the `Chapter` that holds its written text through `chapterId`, so the plan and the draft stay connected. It is separate from `Chapter` because an outline holds structure at any depth and exists before any prose does.

## Chapter
One written section of the book, either front matter, a chapter or back matter (`kind`). It stores the title, the text as HTML (what the editor produces and what the epub is built from), a word count, a status (draft, revised, final) and its `order` in the book. Export reads the chapters of a manuscript in `order`, front matter first and back matter last.

## Revision
A saved copy of a chapter's title and text with a label such as "Before AI edit". It supports editing: the author can snapshot a chapter before changing it, compare versions and restore an old one. It also guards against an AI suggestion being applied badly.

## Suggestion
A proposed edit to a passage in a chapter: the original text, the replacement and a comment explaining why. It comes from the author (`source: user`) or from an AI role (`source: ai`, with `role`), and is pending, accepted or rejected. This is how editing works as a review: nothing from the AI changes the text until the author accepts it.

## AgentMessage
One message in the conversation between the author and an AI role (outliner, editor, proofreader or formatter) about a manuscript. It stores the role, whether the author or the agent wrote it, the text and the time. The AI staff are the "publishing company roles"; keeping the history per manuscript lets each role carry on where it left off, including offline (past conversations stay readable without a connection).

## CoverConcept
One cover picture made by the Book Cover workshop (added in database version 2). It stores the manuscript it belongs to, the prompt sent, the image provider and model, the image itself as a Blob and the time. Concepts are kept so the author can compare them; "Use as cover" copies one onto `Manuscript.cover`.

## Setting
A key/value row for app-wide preferences. Key `ai` holds `AiSettings`: provider (OpenAI or Anthropic), the author's own API key and the model name, because the author supplies their own key. Key `imageAi` holds `ImageAiSettings`: the image provider (OpenAI or Google Gemini), the author's own key and the image model, used only by the Book Cover workshop. Other keys are `editModels`, the active workspace and manuscript, and theme. The key is stored in plain text in the browser database on the author's machine and is only sent to the provider chosen.
