import type { Manuscript, ManuscriptType, OutlineKind } from "@/db/schema";

/**
 * The kinds of book the author can start. The type sets the default length and
 * how the outline is presented: a short story is a flat list of scenes, a novel
 * is acts and chapters, and a series is several novels that share a world, with
 * the outline showing a choice of Book 1, Book 2, Book 3 and so on.
 */
export interface BookTypeInfo {
  label: string;
  description: string;
  /** Default target length, in words, when no genre sets one. */
  targetWords: number;
  /** The kind of the top-level outline items. */
  topKind: OutlineKind;
  /** One line shown above the outline. */
  outlineNote: string;
  /** What the "start" button in an empty outline adds. */
  startLabel: string;
}

export const BOOK_TYPES: Record<ManuscriptType, BookTypeInfo> = {
  "short-story": {
    label: "Short story",
    description: "Under about 7,500 words. The outline is a flat list of scenes.",
    targetWords: 5000,
    topKind: "scene",
    outlineNote: "A short story is a run of scenes, in order. Each scene is one movement of the story.",
    startLabel: "Start with a scene list",
  },
  novella: {
    label: "Novella",
    description: "About 20,000 to 40,000 words, in acts with chapters.",
    targetWords: 30000,
    topKind: "act",
    outlineNote: "A novella is a few parts, each with its chapters, scenes and beats.",
    startLabel: "Start with three acts",
  },
  novel: {
    label: "Novel",
    description: "A full-length book: acts, chapters, scenes and beats.",
    targetWords: 80000,
    topKind: "act",
    outlineNote: "A novel is built in acts, then chapters, scenes and beats.",
    startLabel: "Start with three acts",
  },
  series: {
    label: "Series",
    description: "Several books that share a world and characters. Each book has its own outline, text and export.",
    targetWords: 80000,
    topKind: "act",
    outlineNote: "Pick the book you are outlining. Each book in a series is outlined and exported on its own.",
    startLabel: "Start with three acts",
  },
};

export const BOOK_TYPE_ORDER: ManuscriptType[] = ["short-story", "novella", "novel", "series"];

/** The type of a manuscript. Books made before types existed are novels. */
export function bookTypeOf(manuscript: Pick<Manuscript, "type">): ManuscriptType {
  return manuscript.type ?? "novel";
}

/** The three-act starting outline (acts, each with its beats). */
export const THREE_ACTS: { title: string; points: string[] }[] = [
  { title: "Act I: Setup", points: ["Opening image", "Inciting incident", "First plot point"] },
  { title: "Act II: Confrontation", points: ["Rising action", "Midpoint", "Crisis"] },
  { title: "Act III: Resolution", points: ["Climax", "Resolution"] },
];

/** The scene list a short story starts from. */
export const SCENE_LIST: string[] = ["Opening", "Complication", "Turn", "Climax", "Resolution"];

/** Languages offered for a translation. The author can also type any other language. */
export const LANGUAGE_PRESETS: { code: string; name: string }[] = [
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "pt-PT", name: "Portuguese (Portugal)" },
  { code: "nl", name: "Dutch" },
  { code: "sv", name: "Swedish" },
  { code: "da", name: "Danish" },
  { code: "no", name: "Norwegian" },
  { code: "fi", name: "Finnish" },
  { code: "pl", name: "Polish" },
  { code: "cs", name: "Czech" },
  { code: "hu", name: "Hungarian" },
  { code: "el", name: "Greek" },
  { code: "tr", name: "Turkish" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "he", name: "Hebrew" },
  { code: "hi", name: "Hindi" },
  { code: "id", name: "Indonesian" },
  { code: "vi", name: "Vietnamese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh-Hans", name: "Chinese (Simplified)" },
];

/** The name of a language code, if it is one of the presets. */
export function languageName(code: string): string | undefined {
  return LANGUAGE_PRESETS.find((l) => l.code.toLowerCase() === code.toLowerCase())?.name;
}
