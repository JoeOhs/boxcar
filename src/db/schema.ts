import Dexie, { type Table } from "dexie";

/**
 * boxcar local database (IndexedDB via Dexie).
 *
 * Ownership chain: Workspace (pen name) -> Manuscript -> Chapter / OutlineItem.
 * IndexedDB does not enforce foreign keys, so the delete helpers at the bottom
 * of this file remove child rows by hand.
 */

export type Id = string;
/** Milliseconds since epoch (Date.now()). */
export type Timestamp = number;

export const newId = (): Id => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** One author / pen name. Every manuscript lives in exactly one workspace. */
export interface Workspace {
  id: Id;
  /** The pen name shown on the title page and in the epub author field. */
  name: string;
  bio: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ManuscriptStatus = "outlining" | "drafting" | "editing" | "formatting" | "ready";

/**
 * What kind of book a manuscript is. A "series" is a container: it groups its
 * books (each a manuscript with `seriesId`) and holds no text of its own.
 */
export type ManuscriptType = "short-story" | "novella" | "novel" | "series";

/** Where a translated chapter is in its review: translated, proofread by AI, then approved by the author. */
export type TranslationState = "pending" | "translated" | "proofread" | "approved";

/** The four passes of the editing workflow, in the order they are done. */
export type EditStage = "developmental" | "line" | "copy" | "proofread";

/** Where a manuscript is in the editing workflow. */
export interface EditWorkflow {
  /** The pass being worked on. */
  stage: EditStage;
  /** Passes the author has finished. A pass opens only when the ones before it are finished. */
  completed: EditStage[];
  /** The style guide the copy edit checks against, e.g. "Chicago Manual of Style". */
  styleGuide: string;
}

export type TrimSize = "5x8" | "5.25x8" | "5.5x8.5" | "6x9";
export type ParagraphStyle = "indent" | "block";
export type HeadingStyle = "plain" | "numbered" | "numbered-with-title";

/**
 * Format settings used by the preview and by the export. Embedded in the
 * manuscript (one set per book), so it is not a table of its own.
 */
export interface FormatSettings {
  fontFamily: string;
  /** Percent of the reader's default size; 100 = reader default. */
  fontSizePercent: number;
  lineHeight: number;
  paragraphStyle: ParagraphStyle;
  headingStyle: HeadingStyle;
  /** Text printed between scenes, e.g. "* * *". */
  sceneBreak: string;
  dropCaps: boolean;
  includeTableOfContents: boolean;
  /** Print size for the paper/PDF preview. */
  trimSize: TrimSize;
}

export const DEFAULT_FORMAT: FormatSettings = {
  fontFamily: "Georgia, serif",
  fontSizePercent: 100,
  lineHeight: 1.5,
  paragraphStyle: "indent",
  headingStyle: "numbered-with-title",
  sceneBreak: "* * *",
  dropCaps: false,
  includeTableOfContents: true,
  trimSize: "5.5x8.5",
};

/** The author's brief for the Book Cover workshop, kept with the book so it survives leaving the screen. */
export interface CoverBrief {
  /** Id of one of the looks in src/lib/imageAi.ts, e.g. "illustrated". */
  style: string;
  /** What the cover should show: the subject, scene or symbol. */
  subject: string;
  /** Colours and mood, in the author's words. */
  palette: string;
  /** Anything else the image model should know. */
  extra: string;
  /** True when the title and author name should be lettered into the artwork itself. */
  lettering: boolean;
}

/** One book. Holds the metadata Amazon KDP asks for plus its format settings. */
export interface Manuscript {
  id: Id;
  workspaceId: Id;
  title: string;
  subtitle: string;
  /** Back-cover / store description. */
  description: string;
  /** BCP 47 code, e.g. "en" or "en-US"; written into the epub. */
  language: string;
  isbn: string;
  keywords: string[];
  copyright: string;
  status: ManuscriptStatus;
  /** Absent on books made before types existed, which are novels. */
  type?: ManuscriptType;
  /** For a book in a series: the id of the series container. */
  seriesId?: Id;
  /** For a book in a series: its place in the series (1, 2, 3 ...). */
  volumeNumber?: number;
  /** For a translation: the id of the manuscript it was translated from. */
  translationOf?: Id;
  /** For a translation: the language's name as the AI is told it, e.g. "Swahili". */
  languageName?: string;
  /** Id of the genre chosen for the book (see src/lib/genres.ts), fiction or non-fiction. Absent when none was chosen. */
  genre?: string;
  /** Target word count for the whole book; 0 = none. */
  targetWordCount: number;
  format: FormatSettings;
  /** Progress through developmental, line, copy and proofreading passes. Absent until the first pass is touched. */
  editWorkflow?: EditWorkflow;
  /** Cover image (jpeg/png) included in the epub. */
  cover?: Blob;
  /** What the author last asked the Book Cover workshop for. */
  coverBrief?: CoverBrief;
  /** When the last export finished, if ever. */
  lastExportedAt?: Timestamp;
  /** True once the Roadmap has been given its first cards. */
  roadmapSeeded?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type OutlineKind = "act" | "chapter" | "scene" | "beat";

/**
 * A node in the outline workshop tree (acts, chapters, scenes, beats).
 * Nodes can be moved around freely. A node can point at the Chapter that
 * holds its written text, so the outline and the draft stay linked.
 */
export interface OutlineItem {
  id: Id;
  manuscriptId: Id;
  /** null for a top-level node. */
  parentId: Id | null;
  kind: OutlineKind;
  title: string;
  /** What happens here, in the author's words. */
  summary: string;
  /** Free notes: characters, setting, themes. */
  notes: string;
  /** Position among siblings; sort ascending. Use fractional values to insert. */
  order: number;
  /** Chapter written for this node, if any. */
  chapterId?: Id;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What the story info panel keeps: a character, a location or a situation (what is going on in the story). */
export type StoryEntryKind = "character" | "location" | "situation";

/**
 * One entry in the Outline's story info: a character, a place or a situation the
 * book relies on. It is kept beside the outline and shared with the outliner AI.
 */
export interface StoryEntry {
  id: Id;
  manuscriptId: Id;
  kind: StoryEntryKind;
  name: string;
  /** What the author notes about it: who they are, what the place is like, what is happening. */
  description: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ChapterKind = "front" | "chapter" | "back";
export type ChapterStatus = "draft" | "revised" | "final";

/** One written section of the book: front matter, a chapter, or back matter. */
export interface Chapter {
  id: Id;
  manuscriptId: Id;
  kind: ChapterKind;
  title: string;
  /** The text as HTML (what the editor reads and writes, and what the epub uses). */
  content: string;
  wordCount: number;
  status: ChapterStatus;
  /** Position in the book; sort ascending. */
  order: number;
  /** For a translated chapter: the chapter of the original it is translated from. */
  sourceChapterId?: Id;
  /** For a translated chapter: where it is in its review. */
  translationState?: TranslationState;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** A saved copy of a chapter's text so edits can be compared and restored. */
export interface Revision {
  id: Id;
  chapterId: Id;
  manuscriptId: Id;
  /** Why it was saved, e.g. "Before AI edit" or "Manual snapshot". */
  label: string;
  title: string;
  content: string;
  wordCount: number;
  createdAt: Timestamp;
}

export type SuggestionSource = "user" | "ai";
export type SuggestionStatus = "pending" | "accepted" | "rejected";
/** A "change" replaces a passage; a "note" is feedback with nothing to replace (structural comments). */
export type SuggestionKind = "change" | "note";

/**
 * An edit proposed for a passage of a chapter: replace `original` with
 * `replacement`, with a comment explaining why. Comes from the author or
 * from an AI agent; the author accepts or rejects it.
 */
export interface Suggestion {
  id: Id;
  chapterId: Id;
  manuscriptId: Id;
  source: SuggestionSource;
  /** Which AI role produced it, when source is "ai". */
  role?: AgentRole;
  /** The editing pass it was made in. Absent on suggestions made before the workflow existed. */
  stage?: EditStage;
  /** Absent means "change". */
  kind?: SuggestionKind;
  /** The exact passage the suggestion applies to (matched as text). Empty for a note on the whole chapter. */
  original: string;
  replacement: string;
  comment: string;
  status: SuggestionStatus;
  createdAt: Timestamp;
}

/** The AI staff: each role of the publishing house. */
export type AgentRole = "outliner" | "editor" | "proofreader" | "formatter" | "ghostwriter";

/** One message in a conversation with an AI role about a manuscript. */
export interface AgentMessage {
  id: Id;
  manuscriptId: Id;
  role: AgentRole;
  /** "user" is the author; "agent" is the AI role's reply. */
  from: "user" | "agent";
  text: string;
  createdAt: Timestamp;
}

export type AiProvider = "openai" | "anthropic" | "huggingface" | "ollama";

/** The author's own AI key as the AI calls use it: decrypted in memory only, never stored in this form. */
export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  /** Model name to send to the provider; the app's defaults are in src/lib/providers.ts. */
  model: string;
  /** Address of the server, for providers that run on the author's own computer (Ollama). */
  baseUrl?: string;
}

export type ImageProvider = "openai" | "google";

/** The author's own key for an image-generating model (Book Cover workshop), decrypted in memory only. */
export interface ImageAiSettings {
  provider: ImageProvider;
  apiKey: string;
  /** Image model name, e.g. "gpt-image-1" or "gemini-2.5-flash-image". */
  model: string;
}

export type ApiKeyKind = "text" | "image";
export type ApiKeyStatus = "active" | "revoked";

/**
 * An API key the author has entered, as it is stored: encrypted with AES-GCM
 * under a non-extractable key that lives only in this browser database (see
 * src/lib/keyVault.ts). The plain key is never written to disk. Revoking a key
 * wipes `secret` and keeps the row listed; deleting removes the row.
 */
export interface StoredApiKey {
  id: Id;
  /** "text" keys run the AI staff and the Ghostwriter; "image" keys run the Book Cover workshop. */
  kind: ApiKeyKind;
  /** An AiProvider for text keys, an ImageProvider for image keys. */
  provider: string;
  model: string;
  /** Address of the server, for providers that run on the author's own computer (Ollama). */
  baseUrl?: string;
  /** The last four characters of the key, so it can be recognised in the list. Empty for providers that need no key. */
  tail: string;
  status: ApiKeyStatus;
  /** The encrypted key. Absent once revoked, and for providers that need no key. */
  secret?: { iv: Uint8Array; data: Uint8Array };
  createdAt: Timestamp;
  revokedAt?: Timestamp;
}

/** A cover picture made by the Book Cover workshop, kept so the author can compare and choose. */
export interface CoverConcept {
  id: Id;
  manuscriptId: Id;
  /** The full prompt that was sent to the image model. */
  prompt: string;
  provider: ImageProvider;
  model: string;
  image: Blob;
  createdAt: Timestamp;
}

/** One card on a manuscript's Roadmap: a task in the column (stage) it belongs to, from outline to publish. */
export interface RoadmapCard {
  id: Id;
  manuscriptId: Id;
  /** The column the card sits in. Columns are the manuscript stages. */
  column: ManuscriptStatus;
  title: string;
  /** The screen that does this task, if any, so the card can open it. */
  screen?: "outline" | "write" | "edit" | "format" | "cover" | "export";
  done: boolean;
  /** Position within the column; sort ascending. */
  order: number;
  createdAt: Timestamp;
}

export type ResearchKind = "note" | "link" | "file";

/** One item in a manuscript's research repository, kept beside the writing desk. */
export interface ResearchNote {
  id: Id;
  manuscriptId: Id;
  kind: ResearchKind;
  title: string;
  /** The note's text, or the text of an imported file. */
  content: string;
  /** The web address, for a link. */
  url: string;
  /** When true the Ghostwriter reads this item as background for the book. */
  shareWithGhostwriter: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * The model the author picked for each editing pass, per provider (a model name
 * only makes sense for the provider it belongs to). Stored under key "editModels".
 */
export type EditModels = Partial<Record<AiProvider, Partial<Record<EditStage, string>>>>;

/** App-wide preferences as key/value pairs ("editModels", "keyVaultKey", "activeKey:text", "activeKey:image", "activeWorkspaceId", "theme", "customWords"). */
export interface Setting {
  key: string;
  value: unknown;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export class BoxcarDB extends Dexie {
  workspaces!: Table<Workspace, Id>;
  manuscripts!: Table<Manuscript, Id>;
  outlineItems!: Table<OutlineItem, Id>;
  storyEntries!: Table<StoryEntry, Id>;
  chapters!: Table<Chapter, Id>;
  revisions!: Table<Revision, Id>;
  suggestions!: Table<Suggestion, Id>;
  agentMessages!: Table<AgentMessage, Id>;
  coverConcepts!: Table<CoverConcept, Id>;
  apiKeys!: Table<StoredApiKey, Id>;
  roadmapCards!: Table<RoadmapCard, Id>;
  researchNotes!: Table<ResearchNote, Id>;
  settings!: Table<Setting, string>;

  constructor(name = "boxcar-studio") {
    super(name);
    // Only fields that are queried are indexed. Blobs, text and objects are not.
    this.version(1).stores({
      workspaces: "id, name, updatedAt",
      manuscripts: "id, workspaceId, status, updatedAt",
      outlineItems: "id, manuscriptId, parentId, chapterId, [manuscriptId+order]",
      chapters: "id, manuscriptId, [manuscriptId+order]",
      revisions: "id, chapterId, manuscriptId, createdAt",
      suggestions: "id, chapterId, manuscriptId, status",
      agentMessages: "id, manuscriptId, role, createdAt",
      settings: "key",
    });
    // Version 2 adds the Book Cover workshop's pictures.
    this.version(2).stores({
      coverConcepts: "id, manuscriptId, createdAt",
    });
    // Version 3 adds the encrypted API keys. Keys saved earlier as plain text are
    // encrypted and moved here by migrateLegacyKeys() in src/lib/keyVault.ts.
    this.version(3).stores({
      apiKeys: "id, kind, status, createdAt",
    });
    // Version 4 adds the Roadmap cards and the research repository.
    this.version(4).stores({
      roadmapCards: "id, manuscriptId, column, [manuscriptId+column]",
      researchNotes: "id, manuscriptId, updatedAt",
    });
    // Version 5 indexes books by series and by the book they were translated from.
    this.version(5).stores({
      manuscripts: "id, workspaceId, status, updatedAt, seriesId, translationOf",
    });
    // Version 6 adds the Outline's story info: characters, locations and situations.
    this.version(6).stores({
      storyEntries: "id, manuscriptId, kind, updatedAt",
    });
  }
}

export const db = new BoxcarDB();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await db.settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getEditModels(): Promise<EditModels> {
  return (await getSetting<EditModels>("editModels")) ?? {};
}

export async function saveEditModel(provider: AiProvider, stage: EditStage, model: string): Promise<void> {
  const all = await getEditModels();
  await setSetting<EditModels>("editModels", { ...all, [provider]: { ...all[provider], [stage]: model } });
}

/**
 * Delete a manuscript and everything that belongs to it. Deleting a series also
 * deletes its books, and deleting a book also deletes its translations.
 */
export async function deleteManuscript(manuscriptId: Id): Promise<void> {
  const children = await db.manuscripts.where("seriesId").equals(manuscriptId).primaryKeys();
  const translations = await db.manuscripts.where("translationOf").equals(manuscriptId).primaryKeys();
  for (const childId of [...children, ...translations]) {
    await deleteManuscript(childId);
  }
  return db.transaction(
    "rw",
    [
      db.manuscripts,
      db.outlineItems,
      db.storyEntries,
      db.chapters,
      db.revisions,
      db.suggestions,
      db.agentMessages,
      db.coverConcepts,
      db.roadmapCards,
      db.researchNotes,
    ],
    async () => {
      await db.outlineItems.where("manuscriptId").equals(manuscriptId).delete();
      await db.storyEntries.where("manuscriptId").equals(manuscriptId).delete();
      await db.chapters.where("manuscriptId").equals(manuscriptId).delete();
      await db.revisions.where("manuscriptId").equals(manuscriptId).delete();
      await db.suggestions.where("manuscriptId").equals(manuscriptId).delete();
      await db.agentMessages.where("manuscriptId").equals(manuscriptId).delete();
      await db.coverConcepts.where("manuscriptId").equals(manuscriptId).delete();
      await db.roadmapCards.where("manuscriptId").equals(manuscriptId).delete();
      await db.researchNotes.where("manuscriptId").equals(manuscriptId).delete();
      await db.manuscripts.delete(manuscriptId);
    },
  );
}

/** Delete a workspace and every manuscript in it. */
export async function deleteWorkspace(workspaceId: Id): Promise<void> {
  const ids = await db.manuscripts.where("workspaceId").equals(workspaceId).primaryKeys();
  for (const id of ids) {
    await deleteManuscript(id);
  }
  await db.workspaces.delete(workspaceId);
}

/** Delete a chapter with its revisions and suggestions, and unlink it from the outline. */
export function deleteChapter(chapterId: Id): Promise<void> {
  return db.transaction("rw", [db.chapters, db.revisions, db.suggestions, db.outlineItems], async () => {
    await db.revisions.where("chapterId").equals(chapterId).delete();
    await db.suggestions.where("chapterId").equals(chapterId).delete();
    await db.outlineItems.where("chapterId").equals(chapterId).modify((item) => {
      delete item.chapterId;
    });
    await db.chapters.delete(chapterId);
  });
}

/** Delete an outline node and all of its descendants. The linked chapters are kept. */
export function deleteOutlineItem(itemId: Id): Promise<void> {
  return db.transaction("rw", db.outlineItems, async () => {
    const item = await db.outlineItems.get(itemId);
    if (!item) return;
    const all = await db.outlineItems.where("manuscriptId").equals(item.manuscriptId).toArray();
    const doomed = new Set<Id>([itemId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const other of all) {
        if (other.parentId && doomed.has(other.parentId) && !doomed.has(other.id)) {
          doomed.add(other.id);
          grew = true;
        }
      }
    }
    await db.outlineItems.bulkDelete([...doomed]);
  });
}
