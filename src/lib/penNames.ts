import type { Genre } from "./genres";

/**
 * The pen name generator. It runs on this computer with no AI and no connection:
 * it draws a first name and a surname from word lists whose style suits the genre
 * (a fantasy author sounds like a fantasy author, a business writer like a
 * business writer). The author can always type a name instead.
 */

export type NameStyle = "epic" | "modern" | "classic" | "plain";

const STYLE_WORDS: Record<NameStyle, { first: string[]; last: string[] }> = {
  epic: {
    first: ["Elara", "Corin", "Thessaly", "Rowan", "Isolde", "Caspian", "Maren", "Lysander", "Ondine", "Averil", "Tamsin", "Brannoc"],
    last: ["Ashgrove", "Vale", "Thornwood", "Draycott", "Ravensmere", "Holloway", "Stormcrest", "Eldane", "Moorwick", "Fairholt"],
  },
  modern: {
    first: ["Jude", "Nora", "Miles", "Tessa", "Owen", "Cass", "Rhys", "Lena", "Theo", "Ivy", "Sam", "Wren"],
    last: ["Blackwell", "Harlan", "Quill", "Sterling", "Vance", "Kestrel", "Ashby", "Calloway", "Merrow", "Lockhart"],
  },
  classic: {
    first: ["Harriet", "Edmund", "Clara", "Augustine", "Eleanor", "Thomas", "Violet", "Ambrose", "Beatrice", "Julian"],
    last: ["Hartley", "Pemberton", "Whitcombe", "Ashdown", "Fairweather", "Lockwood", "Greaves", "Penrose", "Wrenfield", "Gale"],
  },
  plain: {
    first: ["Daniel", "Sarah", "Michael", "Laura", "David", "Emma", "Andrew", "Rachel", "Mark", "Hannah", "Peter", "Claire"],
    last: ["Ross", "Bennett", "Carter", "Hughes", "Mitchell", "Dawson", "Reid", "Foster", "Grant", "Porter", "Shaw", "Turner"],
  },
};

const STYLE_BY_GENRE: Record<string, NameStyle> = {
  fantasy: "epic",
  horror: "epic",
  scifi: "modern",
  thriller: "modern",
  romance: "modern",
  ya: "modern",
  middlegrade: "modern",
  mystery: "classic",
  historical: "classic",
  literary: "classic",
  memoir: "plain",
  selfhelp: "plain",
  business: "plain",
  howto: "plain",
  biography: "plain",
  history: "plain",
  science: "plain",
  cookbook: "plain",
  travel: "plain",
  essays: "plain",
};

/** The style of names that suits a genre. With no genre chosen, names are modern. */
export function nameStyleFor(genre: Genre | undefined): NameStyle {
  if (!genre) return "modern";
  return STYLE_BY_GENRE[genre.id] ?? (genre.category === "nonfiction" ? "plain" : "modern");
}

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * A brief list of distinct pen names for a genre. `avoid` holds names already shown
 * (so "Shuffle" gives new ones). Returns fewer than `count` only if the lists run out.
 */
export function generatePenNames(genre: Genre | undefined, count = 5, avoid: string[] = []): string[] {
  const words = STYLE_WORDS[nameStyleFor(genre)];
  const taken = new Set(avoid.map((name) => name.toLowerCase()));
  const names: string[] = [];
  for (let attempt = 0; attempt < 400 && names.length < count; attempt++) {
    const name = `${pick(words.first)} ${pick(words.last)}`;
    const key = name.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    names.push(name);
  }
  return names;
}
