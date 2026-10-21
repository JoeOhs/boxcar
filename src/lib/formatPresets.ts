import {
  DEFAULT_FORMAT,
  type FormatSettings,
  type HeadingStyle,
  type ParagraphStyle,
  type TrimSize,
} from "@/db/schema";

/** A ready-made set of format settings for a kind of book. */
export interface FormatPreset {
  id: string;
  label: string;
  /** Who it suits; also what the AI reads when it chooses. */
  description: string;
  settings: FormatSettings;
}

export const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: "classic-novel",
    label: "Classic novel",
    description: "Traditional fiction: serif type, indented paragraphs, numbered chapters with titles and drop caps. Suits literary, historical and general fiction.",
    settings: {
      fontFamily: "Georgia, serif",
      fontSizePercent: 100,
      lineHeight: 1.5,
      paragraphStyle: "indent",
      headingStyle: "numbered-with-title",
      sceneBreak: "* * *",
      dropCaps: true,
      includeTableOfContents: true,
      trimSize: "5.5x8.5",
    },
  },
  {
    id: "commercial-fiction",
    label: "Commercial fiction",
    description: "Fast, compact pages for thrillers, mystery, crime and science fiction: tighter line spacing, plain numbered chapters, no drop caps.",
    settings: {
      fontFamily: '"Times New Roman", Times, serif',
      fontSizePercent: 100,
      lineHeight: 1.4,
      paragraphStyle: "indent",
      headingStyle: "numbered",
      sceneBreak: "***",
      dropCaps: false,
      includeTableOfContents: true,
      trimSize: "5.25x8",
    },
  },
  {
    id: "romance",
    label: "Romance and light reading",
    description: "Warm and airy: slightly larger Palatino type, generous line spacing, title-only chapter headings and a decorative scene break. Suits romance, cozy and young adult.",
    settings: {
      fontFamily: '"Palatino Linotype", Palatino, serif',
      fontSizePercent: 105,
      lineHeight: 1.7,
      paragraphStyle: "indent",
      headingStyle: "plain",
      sceneBreak: "◆",
      dropCaps: true,
      includeTableOfContents: true,
      trimSize: "5x8",
    },
  },
  {
    id: "literary",
    label: "Literary and memoir",
    description: "Quiet and bookish: Garamond, a little larger, airy lines, numbered chapters and a simple scene break. Suits literary fiction, memoir and essays.",
    settings: {
      fontFamily: "Garamond, serif",
      fontSizePercent: 110,
      lineHeight: 1.6,
      paragraphStyle: "indent",
      headingStyle: "numbered",
      sceneBreak: "~",
      dropCaps: false,
      includeTableOfContents: true,
      trimSize: "5x8",
    },
  },
  {
    id: "non-fiction",
    label: "Non-fiction and guides",
    description: "Clear reference layout: space between paragraphs instead of indents, numbered chapters with titles, a table of contents and a larger page. Suits how-to, business, self-help and academic books.",
    settings: {
      fontFamily: '"Palatino Linotype", Palatino, serif',
      fontSizePercent: 100,
      lineHeight: 1.5,
      paragraphStyle: "block",
      headingStyle: "numbered-with-title",
      sceneBreak: "---",
      dropCaps: false,
      includeTableOfContents: true,
      trimSize: "6x9",
    },
  },
  {
    id: "modern-minimal",
    label: "Modern minimal",
    description: "Clean sans-serif text with space between paragraphs and title-only headings. Suits short books, poetry-adjacent prose, children's chapter books and contemporary non-fiction.",
    settings: {
      fontFamily: "Helvetica, Arial, sans-serif",
      fontSizePercent: 100,
      lineHeight: 1.6,
      paragraphStyle: "block",
      headingStyle: "plain",
      sceneBreak: "* * *",
      dropCaps: false,
      includeTableOfContents: false,
      trimSize: "5.5x8.5",
    },
  },
];

/** The scene breaks the author can choose from. "None" means no mark between scenes. */
export const SCENE_BREAK_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "None" },
  { value: "* * *", label: "* * *" },
  { value: "***", label: "***" },
  { value: "---", label: "---" },
  { value: "~", label: "~" },
  { value: "◆", label: "◆" },
];

export function isSceneBreakChoice(value: string): boolean {
  return SCENE_BREAK_CHOICES.some((choice) => choice.value === value);
}

const TRIM_VALUES: TrimSize[] = ["5x8", "5.25x8", "5.5x8.5", "6x9"];
const HEADING_VALUES: HeadingStyle[] = ["plain", "numbered", "numbered-with-title"];
const PARAGRAPH_VALUES: ParagraphStyle[] = ["indent", "block"];

function inRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/**
 * The format settings a manuscript really uses. A book saved before a setting existed,
 * or a translation copied from one, may lack some of them: those are filled in from the
 * defaults, and any value the app no longer knows is replaced. The preview and the export
 * both read the format through this, so they always have a complete set.
 */
export function resolveFormat(raw: Partial<FormatSettings> | undefined | null): FormatSettings {
  const f: Partial<FormatSettings> = raw ?? {};
  return {
    fontFamily: typeof f.fontFamily === "string" && f.fontFamily.trim() ? f.fontFamily : DEFAULT_FORMAT.fontFamily,
    fontSizePercent: inRange(f.fontSizePercent, DEFAULT_FORMAT.fontSizePercent, 50, 200),
    lineHeight: inRange(f.lineHeight, DEFAULT_FORMAT.lineHeight, 1, 3),
    paragraphStyle: PARAGRAPH_VALUES.includes(f.paragraphStyle as ParagraphStyle) ? (f.paragraphStyle as ParagraphStyle) : DEFAULT_FORMAT.paragraphStyle,
    headingStyle: HEADING_VALUES.includes(f.headingStyle as HeadingStyle) ? (f.headingStyle as HeadingStyle) : DEFAULT_FORMAT.headingStyle,
    sceneBreak: typeof f.sceneBreak === "string" && isSceneBreakChoice(f.sceneBreak) ? f.sceneBreak : DEFAULT_FORMAT.sceneBreak,
    dropCaps: typeof f.dropCaps === "boolean" ? f.dropCaps : DEFAULT_FORMAT.dropCaps,
    includeTableOfContents: typeof f.includeTableOfContents === "boolean" ? f.includeTableOfContents : DEFAULT_FORMAT.includeTableOfContents,
    trimSize: TRIM_VALUES.includes(f.trimSize as TrimSize) ? (f.trimSize as TrimSize) : DEFAULT_FORMAT.trimSize,
  };
}

function sameSettings(a: FormatSettings, b: FormatSettings): boolean {
  return (Object.keys(a) as (keyof FormatSettings)[]).every((key) => a[key] === b[key]);
}

/** The preset the settings match exactly, or undefined when the author has changed something ("custom"). */
export function presetMatching(settings: FormatSettings): FormatPreset | undefined {
  return FORMAT_PRESETS.find((p) => sameSettings(p.settings, settings));
}

export function presetById(id: string): FormatPreset | undefined {
  return FORMAT_PRESETS.find((p) => p.id === id);
}
