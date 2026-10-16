/**
 * Dictionary, thesaurus and spelling for one word the author has selected. The
 * definitions come from dictionaryapi.dev; synonyms, antonyms and spelling suggestions
 * come from Datamuse. Both are free services that need no key. They need a connection.
 */

export interface WordMeaning {
  partOfSpeech: string;
  definitions: string[];
}

export interface WordLookup {
  word: string;
  /** True when the dictionary has the word. When false, the spelling suggestions are the useful part. */
  found: boolean;
  phonetic: string;
  meanings: WordMeaning[];
  synonyms: string[];
  antonyms: string[];
  spellingSuggestions: string[];
}

const DICTIONARY_URL = "https://api.dictionaryapi.dev/api/v2/entries/en/";
const DATAMUSE_WORDS_URL = "https://api.datamuse.com/words";
const DATAMUSE_SUGGEST_URL = "https://api.datamuse.com/sug";

/** A single word: letters, with an apostrophe or hyphen allowed inside it. */
export function isSingleWord(text: string): boolean {
  return /^\p{L}[\p{L}'’-]{0,39}$/u.test(text.trim());
}

interface DictionaryEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[];
}

interface DatamuseWord {
  word?: string;
}

/** A GET that returns null for "not found" and throws for anything else. */
async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The lookup service answered ${response.status}.`);
  return response.json();
}

function wordsFrom(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return (list as DatamuseWord[]).map((item) => item.word ?? "").filter(Boolean);
}

export async function lookupWord(selected: string): Promise<WordLookup> {
  const word = selected.trim().toLowerCase();
  if (!isSingleWord(word)) throw new Error("Select a single word to look it up.");
  const encoded = encodeURIComponent(word);

  try {
    const [dictionary, synonyms, antonyms] = await Promise.all([
      getJson(DICTIONARY_URL + encoded),
      getJson(`${DATAMUSE_WORDS_URL}?rel_syn=${encoded}&max=20`),
      getJson(`${DATAMUSE_WORDS_URL}?rel_ant=${encoded}&max=12`),
    ]);

    const entries = Array.isArray(dictionary) ? (dictionary as DictionaryEntry[]) : [];
    const found = entries.length > 0;
    const meanings: WordMeaning[] = entries.flatMap((entry) =>
      (entry.meanings ?? []).map((m) => ({
        partOfSpeech: m.partOfSpeech ?? "",
        definitions: (m.definitions ?? []).map((d) => d.definition ?? "").filter(Boolean).slice(0, 4),
      })),
    );
    const phonetic = entries.map((e) => e.phonetic || e.phonetics?.find((p) => p.text)?.text || "").find(Boolean) ?? "";

    const spellingSuggestions = found ? [] : wordsFrom(await getJson(`${DATAMUSE_SUGGEST_URL}?s=${encoded}`)).slice(0, 8);

    return {
      word,
      found,
      phonetic,
      meanings,
      synonyms: wordsFrom(synonyms).slice(0, 20),
      antonyms: wordsFrom(antonyms).slice(0, 12),
      spellingSuggestions,
    };
  } catch {
    throw new Error("Word lookup needs an internet connection. Check your connection and try again.");
  }
}
