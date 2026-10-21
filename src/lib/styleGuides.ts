/**
 * The style guides the copy edit can follow. Each one is a pre-programmed copy
 * editing agent: its rules say what the guide asks for, and its persona tells the
 * AI to act as a copy editor who knows that guide. The author picks one from a
 * dropdown in Edit; nothing is typed.
 */

export interface StyleGuideAgent {
  /** Stored on the manuscript's edit workflow. "" (house style) is the default. */
  id: string;
  label: string;
  /** The conventions the copy edit checks against. */
  rules: string;
  /** Who the AI is told it is when it copy edits with this guide. */
  persona: string;
}

export const STYLE_GUIDE_AGENTS: StyleGuideAgent[] = [
  {
    id: "",
    label: "House style (standard conventions)",
    rules:
      "Standard conventions of the book's language. Keep spelling, capitalisation, numbers, names and hyphenation consistent throughout the book.",
    persona:
      "You are the Copy Editor at a small publishing house with no fixed style manual. You apply the standard conventions of the book's language and make sure the text is consistent with itself.",
  },
  {
    id: "chicago",
    label: "Chicago Manual of Style",
    rules:
      "The Chicago Manual of Style (17th edition): US spelling; the serial (Oxford) comma; spell out whole numbers from one to one hundred; hyphenate compound modifiers before a noun; en dashes for ranges; double quotation marks for dialogue; title case for titles.",
    persona:
      "You are the Copy Editor at a publishing house that follows The Chicago Manual of Style (17th edition). You check US spelling, the serial comma, number style, hyphenation, quotation marks and capitalisation exactly as Chicago does, and you leave the author's voice alone.",
  },
  {
    id: "ap",
    label: "AP Stylebook",
    rules:
      "The Associated Press Stylebook: US spelling; no serial comma unless it prevents confusion; numerals for ages and for most numbers from 10 up, words for one through nine; the percent sign is used with numerals in news style, 'percent' in text; titles capitalised only before a name; state names abbreviated only in addresses.",
    persona:
      "You are the Copy Editor at a publishing house that follows the AP Stylebook. You check US spelling, number style, the serial comma rule, capitalisation of titles and abbreviations exactly as AP does, and you leave the author's voice alone.",
  },
  {
    id: "mla",
    label: "MLA Handbook",
    rules:
      "The MLA Handbook (9th edition): US spelling; spell out numbers from one to one hundred and round numbers; italicise the titles of books, films and plays, and put the titles of articles, chapters and poems in double quotation marks; consistent in-text citation style; inclusive, precise language.",
    persona:
      "You are the Copy Editor at a publishing house that follows the MLA Handbook (9th edition). You check US spelling, number style, title punctuation and italics, quotation and citation consistency, and you leave the author's voice alone.",
  },
  {
    id: "apa",
    label: "APA Publication Manual",
    rules:
      "The APA Publication Manual (7th edition): US spelling; the serial comma; numerals for 10 and above, words for one through nine; bias-free language; sentence-case headings; 'participants' for people taking part in research; no unnecessary capitalisation.",
    persona:
      "You are the Copy Editor at a publishing house that follows the APA Publication Manual (7th edition). You check US spelling, number style, heading case, bias-free wording and consistency of terms, and you leave the author's voice alone.",
  },
  {
    id: "oxford",
    label: "New Oxford Style Manual",
    rules:
      "The New Oxford Style Manual: British spelling; single quotation marks for dialogue with double inside; the serial comma only where it prevents ambiguity; dates written as 3 May 2026; numbers spelled out up to one hundred; hyphens used sparingly.",
    persona:
      "You are the Copy Editor at a publishing house that follows the New Oxford Style Manual. You check British spelling, quotation marks, the use of the serial comma, date and number style, and you leave the author's voice alone.",
  },
];

/** The style agent for a stored id. An unknown or old free-text value falls back to house style. */
export function styleGuideAgent(id: string | undefined): StyleGuideAgent {
  return STYLE_GUIDE_AGENTS.find((s) => s.id === id) ?? STYLE_GUIDE_AGENTS[0];
}
