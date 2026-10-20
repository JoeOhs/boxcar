import type { Genre } from "./genres";

/**
 * The look of a book-cover mockup. A mockup is drawn in CSS from the book's title
 * and pen name, in the style that covers of its genre usually have. It needs no
 * image model and no connection, so every author (whether the pen name was
 * generated or typed in) can see how the cover will read.
 */
export interface MockupLook {
  background: string;
  ink: string;
  accent: string;
  fontFamily: string;
  uppercase: boolean;
}

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Helvetica, Arial, sans-serif';

const LOOK_BY_GENRE: Record<string, MockupLook> = {
  fantasy: { background: "linear-gradient(160deg,#1e3a3a,#0b1a22 60%,#2b1a3d)", ink: "#f4e7c3", accent: "#d4a94a", fontFamily: SERIF, uppercase: false },
  horror: { background: "linear-gradient(180deg,#2a0606,#000)", ink: "#e5e5e5", accent: "#b91c1c", fontFamily: SERIF, uppercase: true },
  scifi: { background: "linear-gradient(180deg,#0b1d3a,#02050d)", ink: "#e6f7ff", accent: "#37d5ff", fontFamily: SANS, uppercase: true },
  mystery: { background: "linear-gradient(170deg,#2b2f36,#111318)", ink: "#eceae4", accent: "#c0392b", fontFamily: SERIF, uppercase: false },
  thriller: { background: "linear-gradient(180deg,#171717,#000)", ink: "#ffffff", accent: "#e11d48", fontFamily: SANS, uppercase: true },
  romance: { background: "linear-gradient(160deg,#f8d7da,#f0b3c0)", ink: "#5b2333", accent: "#b5476b", fontFamily: SERIF, uppercase: false },
  historical: { background: "linear-gradient(180deg,#eadcbf,#c9b48a)", ink: "#3b2a17", accent: "#7a4e1d", fontFamily: SERIF, uppercase: false },
  literary: { background: "linear-gradient(180deg,#f5f1e8,#e4dccb)", ink: "#2a2a2a", accent: "#6b7280", fontFamily: SERIF, uppercase: false },
  ya: { background: "linear-gradient(150deg,#ff7e5f,#feb47b)", ink: "#ffffff", accent: "#2d1b69", fontFamily: SANS, uppercase: false },
  middlegrade: { background: "linear-gradient(150deg,#56ccf2,#2f80ed)", ink: "#ffffff", accent: "#ffd166", fontFamily: SANS, uppercase: false },
};

const NONFICTION_LOOK: MockupLook = {
  background: "linear-gradient(180deg,#ffffff,#eef2f7)",
  ink: "#0f172a",
  accent: "#2563eb",
  fontFamily: SANS,
  uppercase: false,
};

const FICTION_LOOK: MockupLook = {
  background: "linear-gradient(180deg,#3f3f46,#18181b)",
  ink: "#fafafa",
  accent: "#a1a1aa",
  fontFamily: SERIF,
  uppercase: false,
};

/** The cover look for a genre. With no genre, a plain look. */
export function mockupLook(genre: Genre | undefined): MockupLook {
  if (!genre) return FICTION_LOOK;
  return LOOK_BY_GENRE[genre.id] ?? (genre.category === "nonfiction" ? NONFICTION_LOOK : FICTION_LOOK);
}
