import type { FormatSettings } from "@/db/schema";
import type { Genre } from "./genres";

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
    description: "Traditional fiction: serif type, indented paragraphs, numbered chapters with titles and drop caps. Suits fantasy, urban fantasy, historical, contemporary, Christian, LGBTQ+ and Western fiction.",
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
    description: "Fast, compact pages for thrillers, mystery, crime, action, science fiction, dystopian, horror and true crime: tighter line spacing, plain numbered chapters, no drop caps.",
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
    description: "Warm and airy: slightly larger Palatino type, generous line spacing, title-only chapter headings and a decorative scene break. Suits romance, women's fiction, paranormal, cozy mystery, humor, young adult and lighter reading.",
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
    description: "Quiet and bookish: Garamond, a little larger, airy lines, numbered chapters and a simple scene break. Suits literary fiction, magical realism, short stories, memoir, travel, essays and philosophy.",
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
    description: "Clear reference layout: space between paragraphs instead of indents, numbered chapters with titles, a table of contents and a larger page. Suits every non-fiction genre: self-help, business, how-to, biography, history, science, cookbooks, health, politics and the rest.",
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

/** The format preset that suits each genre in the genre guide. Genres not listed fall back to the preset for their kind of book. */
const GENRE_PRESET: Record<string, string> = {
  fantasy: "classic-novel",
  urbanfantasy: "classic-novel",
  historical: "classic-novel",
  contemporary: "classic-novel",
  christian: "classic-novel",
  lgbtq: "classic-novel",
  western: "classic-novel",
  scifi: "commercial-fiction",
  mystery: "commercial-fiction",
  thriller: "commercial-fiction",
  action: "commercial-fiction",
  horror: "commercial-fiction",
  dystopian: "commercial-fiction",
  truecrime: "commercial-fiction",
  romance: "romance",
  womens: "romance",
  paranormal: "romance",
  cozy: "romance",
  humor: "romance",
  ya: "romance",
  literary: "literary",
  magicalrealism: "literary",
  shortstories: "literary",
  memoir: "literary",
  travel: "literary",
  essays: "literary",
  philosophy: "literary",
  middlegrade: "modern-minimal",
  selfhelp: "non-fiction",
  business: "non-fiction",
  howto: "non-fiction",
  biography: "non-fiction",
  history: "non-fiction",
  science: "non-fiction",
  cookbook: "non-fiction",
  religion: "non-fiction",
  health: "non-fiction",
  parenting: "non-fiction",
  finance: "non-fiction",
  politics: "non-fiction",
  education: "non-fiction",
  technology: "non-fiction",
  sports: "non-fiction",
  nature: "non-fiction",
  art: "non-fiction",
};

/** The format preset suggested for a genre, or undefined when no genre is chosen. */
export function presetForGenre(genre: Genre | undefined): FormatPreset | undefined {
  if (!genre) return undefined;
  const id = GENRE_PRESET[genre.id] ?? (genre.category === "fiction" ? "classic-novel" : "non-fiction");
  return presetById(id);
}
