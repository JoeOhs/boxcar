/**
 * The genre guide. When a manuscript is created the author picks fiction or
 * non-fiction and then a genre; the genre gives the book a target length, a
 * ready-made outline structure, the conventions readers expect, keywords for
 * the store page and a look for the cover. The chosen genre id is stored on the
 * manuscript (`Manuscript.genre`).
 */

export type GenreCategory = "fiction" | "nonfiction";

export const CATEGORY_LABEL: Record<GenreCategory, string> = {
  fiction: "Fiction",
  nonfiction: "Non-fiction",
};

/** One top-level part of a genre's outline and the points under it. */
export interface GenreSection {
  title: string;
  points: string[];
}

export interface Genre {
  id: string;
  category: GenreCategory;
  label: string;
  /** One line on what the genre is. */
  summary: string;
  /** Typical length, as readers and stores expect it. */
  lengthNote: string;
  /** Word count to aim for; becomes the manuscript's target. */
  targetWords: number;
  /** Outline structure: acts with beats for fiction, chapters with key points for non-fiction. */
  structure: GenreSection[];
  /** What readers of this genre expect from the book. */
  conventions: string[];
  /** Starting keywords for the store page (Amazon KDP allows seven). */
  keywords: string[];
  /** How covers in this genre usually look; used by the Book Cover workshop. */
  coverLook: string;
}

export const GENRES: Genre[] = [
  // ---- Fiction ----
  {
    id: "fantasy",
    category: "fiction",
    label: "Fantasy",
    summary: "A world with magic or the impossible, and a quest or conflict that decides its fate.",
    lengthNote: "90,000 to 120,000 words",
    targetWords: 100000,
    structure: [
      { title: "Act I: The ordinary world", points: ["Home and what is missing", "The call to adventure", "Crossing into the unknown"] },
      { title: "Act II: The road of trials", points: ["Allies and enemies", "The magic and its cost", "The midpoint revelation", "The darkest hour"] },
      { title: "Act III: The return", points: ["The final confrontation", "The price paid", "A changed world"] },
    ],
    conventions: [
      "Build the world through the characters' eyes rather than in long explanations.",
      "Give magic clear rules and a cost.",
      "A map, a glossary or a cast list in the front or back matter is welcome.",
      "Series are the norm, so end the book satisfyingly while leaving the world open.",
    ],
    keywords: ["fantasy", "epic fantasy", "magic", "quest", "adventure", "world building", "fantasy series"],
    coverLook: "an illustrated or painterly landscape or figure, rich saturated colours, a sense of scale and wonder, bold decorative lettering",
  },
  {
    id: "scifi",
    category: "fiction",
    label: "Science fiction",
    summary: "Stories that ask what happens when science, technology or the future changes us.",
    lengthNote: "80,000 to 100,000 words",
    targetWords: 90000,
    structure: [
      { title: "Act I: The premise", points: ["Life as it is", "The disruption: a discovery, a ship, a signal", "A choice with no way back"] },
      { title: "Act II: Consequences", points: ["Exploring the new reality", "The idea pushed to its limit", "Midpoint reversal", "Everything goes wrong"] },
      { title: "Act III: Resolution", points: ["The plan", "The climax", "What the world is now"] },
    ],
    conventions: [
      "Start from one strong 'what if' and follow its consequences honestly.",
      "Keep the science credible within the book's own rules.",
      "Show the human cost of the technology, not only the idea.",
    ],
    keywords: ["science fiction", "sci-fi", "space opera", "dystopian", "futuristic", "technology", "aliens"],
    coverLook: "sleek, cinematic and futuristic, a planet, ship or lone figure against deep space or a neon city, clean modern sans-serif lettering",
  },
  {
    id: "mystery",
    category: "fiction",
    label: "Mystery and crime",
    summary: "A crime or puzzle at the centre, and a detective or amateur sleuth who solves it.",
    lengthNote: "70,000 to 90,000 words",
    targetWords: 80000,
    structure: [
      { title: "Act I: The crime", points: ["The sleuth and their world", "The crime is discovered", "The investigation begins, suspects appear"] },
      { title: "Act II: The investigation", points: ["Clues and red herrings", "A second turn: another victim or a lie exposed", "The sleuth is in danger", "All seems lost"] },
      { title: "Act III: The solution", points: ["The missing piece", "The reveal", "Justice and the aftermath"] },
    ],
    conventions: [
      "Play fair: every clue the sleuth uses must be available to the reader.",
      "Give each suspect a believable motive.",
      "The solution should be surprising yet feel inevitable.",
    ],
    keywords: ["mystery", "crime fiction", "detective", "whodunit", "murder mystery", "cozy mystery", "amateur sleuth"],
    coverLook: "moody and atmospheric, a single telling object or silhouette, muted palette with one accent colour, strong serif or hand-drawn lettering",
  },
  {
    id: "thriller",
    category: "fiction",
    label: "Thriller and suspense",
    summary: "High stakes, a ticking clock and a protagonist who cannot afford to fail.",
    lengthNote: "80,000 to 100,000 words",
    targetWords: 90000,
    structure: [
      { title: "Act I: The threat", points: ["A hook that grips at once", "Normal life with a flaw in it", "The threat becomes personal"] },
      { title: "Act II: The chase", points: ["Escalating pursuit", "A betrayal or false ally", "Midpoint twist", "The trap closes"] },
      { title: "Act III: The reckoning", points: ["The last gamble", "The showdown", "The cost and the quiet after"] },
    ],
    conventions: [
      "Short chapters that end on a hook keep readers turning pages.",
      "Raise the stakes steadily and never let the pressure drop for long.",
      "Plant the twist early so it feels earned.",
    ],
    keywords: ["thriller", "suspense", "psychological thriller", "action", "conspiracy", "page-turner", "crime thriller"],
    coverLook: "high contrast and dark, a lone figure or a stark object, bold oversized sans-serif lettering, red, black and white or cold blue",
  },
  {
    id: "romance",
    category: "fiction",
    label: "Romance",
    summary: "A love story in which the relationship is the plot and the ending is hopeful.",
    lengthNote: "50,000 to 90,000 words",
    targetWords: 70000,
    structure: [
      { title: "Act I: The meeting", points: ["Each lead alone, with a want and a wound", "The meet", "A reason to keep seeing each other"] },
      { title: "Act II: Closer", points: ["Growing attraction", "The first real intimacy", "The midpoint commitment", "The black moment that pulls them apart"] },
      { title: "Act III: Together", points: ["Each faces their own flaw", "The grand gesture", "The happily ever after or happy for now"] },
    ],
    conventions: [
      "A satisfying, optimistic ending is required by the genre.",
      "Show what stands between the couple from inside the characters, not only from outside.",
      "Know your sub-genre (contemporary, historical, paranormal, romantic comedy) and its heat level.",
    ],
    keywords: ["romance", "love story", "contemporary romance", "romantic comedy", "happily ever after", "second chance romance", "small town romance"],
    coverLook: "warm and inviting, an illustrated couple or a charming setting, soft bright colours, playful script lettering",
  },
  {
    id: "historical",
    category: "fiction",
    label: "Historical fiction",
    summary: "Invented characters and stories set in a real time and place in the past.",
    lengthNote: "80,000 to 110,000 words",
    targetWords: 95000,
    structure: [
      { title: "Act I: The world as it was", points: ["The character in their time and place", "The historical event that changes things", "A personal stake in it"] },
      { title: "Act II: Caught in history", points: ["Living through the event", "Real figures and invented lives cross", "Midpoint turn", "Loss and hard choices"] },
      { title: "Act III: Aftermath", points: ["The decisive moment", "How things settle", "What the character carries forward"] },
    ],
    conventions: [
      "Research the period, then use only the details that serve the story.",
      "Keep dialogue and attitudes believable for the era without being hard to read.",
      "An author's note separating fact from invention is expected.",
    ],
    keywords: ["historical fiction", "historical novel", "world war", "regency", "victorian", "period drama", "based on true events"],
    coverLook: "a period-accurate painting or photograph treated with a muted, slightly aged palette, elegant serif lettering",
  },
  {
    id: "horror",
    category: "fiction",
    label: "Horror",
    summary: "Fear, dread and the unnatural, ending in survival, loss or something worse.",
    lengthNote: "60,000 to 90,000 words",
    targetWords: 75000,
    structure: [
      { title: "Act I: Unease", points: ["A normal world with a crack in it", "The first sign that something is wrong", "Denial, then the first real fright"] },
      { title: "Act II: Closing in", points: ["The rules of the threat are learned", "Isolation: help fails or leaves", "Midpoint horror", "The worst loss"] },
      { title: "Act III: Confrontation", points: ["Facing the source", "The cost of surviving", "A last unsettling note"] },
    ],
    conventions: [
      "Dread works better than gore: suggest more than you show.",
      "Make the reader care about the characters before you hurt them.",
      "Keep the threat's logic consistent, even if it is unnatural.",
    ],
    keywords: ["horror", "supernatural horror", "psychological horror", "haunted house", "creepy", "dark fiction", "gothic"],
    coverLook: "dark and unsettling, deep black with a single pale or blood-red element, distressed texture, stark condensed lettering",
  },
  {
    id: "literary",
    category: "fiction",
    label: "Literary fiction",
    summary: "Character, language and theme come first; the story explores how people live.",
    lengthNote: "70,000 to 100,000 words",
    targetWords: 85000,
    structure: [
      { title: "Part one: The situation", points: ["A life and its quiet tension", "The event that unsettles it", "What the character wants versus what they need"] },
      { title: "Part two: Complications", points: ["Relationships tested", "A memory or secret surfaces", "The turn", "The cost of change"] },
      { title: "Part three: Understanding", points: ["The decisive moment", "What is understood too late or just in time", "A resonant close"] },
    ],
    conventions: [
      "Voice and the quality of the prose carry the book.",
      "A theme should arise from the characters' choices, not be stated.",
      "Endings can be open, but they must feel earned.",
    ],
    keywords: ["literary fiction", "contemporary fiction", "family saga", "character-driven", "book club", "coming of age", "women's fiction"],
    coverLook: "restrained and artful, a simple image or abstract painting, generous empty space, refined serif lettering",
  },
  {
    id: "ya",
    category: "fiction",
    label: "Young adult",
    summary: "Stories for teenage readers about identity, belonging and the first big choices.",
    lengthNote: "60,000 to 90,000 words",
    targetWords: 75000,
    structure: [
      { title: "Act I: Before", points: ["The teen's world and what they want", "The event that upends it", "Deciding to act"] },
      { title: "Act II: Out of their depth", points: ["New people and new rules", "A first win, then a setback", "Midpoint: a truth about themselves", "Everything falls apart"] },
      { title: "Act III: After", points: ["Taking responsibility", "The climax on their own terms", "Who they have become"] },
    ],
    conventions: [
      "Keep to a close first or third person and a voice that sounds like a teen.",
      "The protagonist drives the plot; adults support rather than solve it.",
      "Fast pacing and emotional honesty matter more than length.",
    ],
    keywords: ["young adult", "YA fiction", "coming of age", "teen", "YA fantasy", "YA contemporary", "friendship"],
    coverLook: "bold, graphic and modern, a striking symbol or stylised figure, bright or neon colours, large expressive lettering",
  },
  {
    id: "middlegrade",
    category: "fiction",
    label: "Middle grade",
    summary: "Adventures and friendships for readers of about eight to twelve.",
    lengthNote: "30,000 to 55,000 words",
    targetWords: 45000,
    structure: [
      { title: "Act I: The problem", points: ["A hero with a want and a flaw", "Something unusual happens", "A friend joins in"] },
      { title: "Act II: The adventure", points: ["Trying and failing", "A clever idea", "A betrayal or misunderstanding", "A low point"] },
      { title: "Act III: The win", points: ["Using what was learned", "The big moment", "Home again, a little different"] },
    ],
    conventions: [
      "Short chapters, clear stakes and plenty of humour or wonder.",
      "Kids drive the action; keep content suitable for the age group.",
      "A warm, hopeful ending.",
    ],
    keywords: ["middle grade", "children's book", "kids adventure", "ages 8-12", "friendship", "funny kids book", "chapter book"],
    coverLook: "colourful illustrated scene full of energy and humour, friendly rounded lettering",
  },

  // ---- Non-fiction ----
  {
    id: "memoir",
    category: "nonfiction",
    label: "Memoir",
    summary: "A true story from your own life, told for what it means, not only what happened.",
    lengthNote: "60,000 to 90,000 words",
    targetWords: 75000,
    structure: [
      { title: "Chapter 1: The opening scene", points: ["A moment that shows the stakes", "Who you were then"] },
      { title: "Chapter 2: Where it began", points: ["Family, place and the forces that shaped you", "The first sign of the central conflict"] },
      { title: "Chapter 3: The turning point", points: ["The event that changed everything", "What it cost you"] },
      { title: "Chapter 4: The struggle", points: ["Setbacks and what you tried", "Help and hindrance"] },
      { title: "Chapter 5: What it meant", points: ["How you changed", "What the reader can take from it"] },
    ],
    conventions: [
      "Choose a theme or a slice of life; a memoir is not an autobiography of everything.",
      "Use scenes and dialogue, not only summary, and be honest about your own flaws.",
      "Consider the privacy of the real people in your story.",
    ],
    keywords: ["memoir", "true story", "personal story", "autobiography", "life story", "inspirational", "resilience"],
    coverLook: "an evocative photograph or a simple symbolic image, understated palette, personal and honest lettering",
  },
  {
    id: "selfhelp",
    category: "nonfiction",
    label: "Self-help",
    summary: "A practical path to a better life, built on a clear promise and a method.",
    lengthNote: "40,000 to 60,000 words",
    targetWords: 50000,
    structure: [
      { title: "Introduction: The promise", points: ["The problem the reader has", "Why this approach works", "How to use the book"] },
      { title: "Chapter 1: Understanding the problem", points: ["The root cause", "A story that makes it real"] },
      { title: "Chapter 2: The method", points: ["The core idea or framework", "A step-by-step walk-through"] },
      { title: "Chapter 3: Putting it into practice", points: ["Exercises and examples", "Common obstacles and how to get past them"] },
      { title: "Conclusion: Keeping going", points: ["A summary of the key steps", "A first action to take today"] },
    ],
    conventions: [
      "Make one clear promise in the title and deliver it.",
      "Mix stories, evidence and exercises; end each chapter with a takeaway.",
      "Write directly to 'you' and stay encouraging and practical.",
    ],
    keywords: ["self-help", "personal growth", "motivation", "habits", "mindset", "personal development", "success"],
    coverLook: "clean and bright, a bold title treatment with a simple icon or abstract shape, confident sans-serif lettering, optimistic colours",
  },
  {
    id: "business",
    category: "nonfiction",
    label: "Business and leadership",
    summary: "Ideas, frameworks and lessons for people who work, manage or build companies.",
    lengthNote: "40,000 to 70,000 words",
    targetWords: 55000,
    structure: [
      { title: "Introduction: The challenge", points: ["The problem in the market or workplace", "Your credibility and your thesis"] },
      { title: "Chapter 1: The big idea", points: ["The framework in one page", "Why the old approach fails"] },
      { title: "Chapter 2: The evidence", points: ["Case studies", "Data and research"] },
      { title: "Chapter 3: The playbook", points: ["Steps to apply it", "Tools and templates"] },
      { title: "Conclusion: What to do Monday", points: ["The summary", "A call to action"] },
    ],
    conventions: [
      "Lead with a memorable thesis or framework and name it.",
      "Support claims with real cases and cite your sources.",
      "Keep chapters skimmable with headings, summaries and checklists.",
    ],
    keywords: ["business", "leadership", "management", "entrepreneurship", "productivity", "career", "startup"],
    coverLook: "minimal and confident, a bold typographic cover with one strong colour block or simple geometric shape, modern sans-serif lettering",
  },
  {
    id: "howto",
    category: "nonfiction",
    label: "How-to guide",
    summary: "Teaches the reader a skill or helps them complete a project, step by step.",
    lengthNote: "25,000 to 50,000 words",
    targetWords: 35000,
    structure: [
      { title: "Introduction: What you will be able to do", points: ["The result", "What you need before you start"] },
      { title: "Chapter 1: The basics", points: ["Key terms and tools", "The common mistakes to avoid"] },
      { title: "Chapter 2: The core process", points: ["Step-by-step instructions", "Worked example"] },
      { title: "Chapter 3: Going further", points: ["Advanced techniques", "Troubleshooting"] },
      { title: "Appendix: Resources", points: ["Checklists", "Further reading"] },
    ],
    conventions: [
      "Organise by what the reader wants to do, in the order they will do it.",
      "Use numbered steps, short paragraphs and plenty of examples.",
      "Test every instruction as if you were a beginner.",
    ],
    keywords: ["how to", "guide", "beginners", "step by step", "tutorial", "handbook", "DIY"],
    coverLook: "clear and friendly, a simple illustration or photograph of the finished result or the tools, bright clean colours, highly legible lettering",
  },
  {
    id: "biography",
    category: "nonfiction",
    label: "Biography",
    summary: "The life of a real person, researched and told as a compelling story.",
    lengthNote: "80,000 to 120,000 words",
    targetWords: 95000,
    structure: [
      { title: "Chapter 1: Origins", points: ["Family and place", "Early influences"] },
      { title: "Chapter 2: Becoming", points: ["Education and first steps", "The break"] },
      { title: "Chapter 3: Achievement", points: ["The defining work or event", "Allies and rivals"] },
      { title: "Chapter 4: Cost and conflict", points: ["Private life", "Setbacks and controversy"] },
      { title: "Chapter 5: Legacy", points: ["Later years", "How the person is remembered"] },
    ],
    conventions: [
      "Ground every claim in sources, and list them in notes or a bibliography.",
      "Tell a story with a point of view rather than a list of dates.",
      "Treat the subject fairly, including the unflattering parts.",
    ],
    keywords: ["biography", "life story", "history", "famous people", "true story", "leaders", "inspiring lives"],
    coverLook: "a striking portrait or archival photograph, refined palette, classic serif lettering with the name large",
  },
  {
    id: "history",
    category: "nonfiction",
    label: "History",
    summary: "An event, era or idea from the past explained through evidence and narrative.",
    lengthNote: "80,000 to 120,000 words",
    targetWords: 95000,
    structure: [
      { title: "Introduction: Why this matters", points: ["The question the book answers", "Sources and approach"] },
      { title: "Part 1: Background", points: ["The world before", "The causes"] },
      { title: "Part 2: The events", points: ["How it unfolded", "The people who shaped it"] },
      { title: "Part 3: Consequences", points: ["What changed", "Competing interpretations"] },
      { title: "Conclusion: What it tells us", points: ["The argument in short", "Why it still matters"] },
    ],
    conventions: [
      "Make an argument, not just a chronology.",
      "Cite sources and note disagreements among historians.",
      "Maps, timelines and a list of key people help readers keep track.",
    ],
    keywords: ["history", "world history", "military history", "ancient history", "european history", "american history", "nonfiction history"],
    coverLook: "an archival image, painting or map treated with a muted aged palette, strong classic lettering",
  },
  {
    id: "science",
    category: "nonfiction",
    label: "Popular science",
    summary: "Explains real science and discovery to curious readers without the jargon.",
    lengthNote: "60,000 to 90,000 words",
    targetWords: 70000,
    structure: [
      { title: "Introduction: The mystery", points: ["The question that drives the book", "Why it matters now"] },
      { title: "Part 1: What we know", points: ["The basic ideas in plain language", "The scientists who found them"] },
      { title: "Part 2: What we are learning", points: ["Current research and its surprises", "Where the experts disagree"] },
      { title: "Part 3: What it means", points: ["Effects on everyday life", "Open questions"] },
      { title: "Conclusion: The bigger picture", points: ["The core idea", "What the reader can do or watch for"] },
    ],
    conventions: [
      "Use analogies and stories to carry difficult ideas.",
      "Be accurate about what is proved and what is still debated.",
      "Notes and references let curious readers go further.",
    ],
    keywords: ["popular science", "science", "nature", "physics", "biology", "discovery", "how things work"],
    coverLook: "striking and curious, a clean illustration or macro photograph of the subject, vivid accent colours on a calm background, modern lettering",
  },
  {
    id: "cookbook",
    category: "nonfiction",
    label: "Cookbook",
    summary: "Recipes, techniques and the food stories that go with them.",
    lengthNote: "20,000 to 40,000 words plus recipes",
    targetWords: 30000,
    structure: [
      { title: "Introduction: My kitchen", points: ["The idea behind the book", "Equipment and pantry"] },
      { title: "Chapter 1: Starters and small plates", points: ["Recipe list", "A technique spotlight"] },
      { title: "Chapter 2: Mains", points: ["Recipe list", "Making it ahead"] },
      { title: "Chapter 3: Sides and sauces", points: ["Recipe list", "Substitutions"] },
      { title: "Chapter 4: Desserts", points: ["Recipe list", "Serving and presenting"] },
    ],
    conventions: [
      "Give ingredients with exact amounts, clear steps, timings and servings.",
      "Test every recipe more than once.",
      "Use the same layout for every recipe and add a conversion chart.",
    ],
    keywords: ["cookbook", "recipes", "home cooking", "easy recipes", "baking", "healthy eating", "meal prep"],
    coverLook: "bright, appetising food photography from above or at an angle, warm natural light, friendly handwritten or rounded lettering",
  },
  {
    id: "travel",
    category: "nonfiction",
    label: "Travel",
    summary: "A place, a journey or a way of travelling, shared through story or practical guidance.",
    lengthNote: "40,000 to 80,000 words",
    targetWords: 60000,
    structure: [
      { title: "Chapter 1: Setting out", points: ["Why this place or journey", "The first impressions"] },
      { title: "Chapter 2: The route", points: ["Places and people along the way", "The detours"] },
      { title: "Chapter 3: Taste and culture", points: ["Food, customs and history", "A moment that went wrong"] },
      { title: "Chapter 4: Arriving", points: ["What the trip changed", "Practical advice for the reader"] },
    ],
    conventions: [
      "Bring the place alive with senses and specific detail.",
      "Balance your own story with information the reader can use.",
      "Check facts and local details, which change quickly.",
    ],
    keywords: ["travel", "travel writing", "adventure", "road trip", "travel guide", "backpacking", "culture"],
    coverLook: "a vivid photograph or illustration of the destination, saturated colours and light, adventurous lettering",
  },
  {
    id: "essays",
    category: "nonfiction",
    label: "Essay collection",
    summary: "Linked essays that look at one subject or one mind from several sides.",
    lengthNote: "40,000 to 70,000 words",
    targetWords: 55000,
    structure: [
      { title: "Opening essay: The question", points: ["The thread that connects the collection", "A strong voice"] },
      { title: "Essays: The middle", points: ["Contrasting pieces", "A personal essay", "A reported or researched essay"] },
      { title: "Closing essay: The answer or the open door", points: ["Pull the threads together", "A final image"] },
    ],
    conventions: [
      "Order the pieces so each one changes how you read the next.",
      "Keep a consistent voice and a thread running through the collection.",
      "Credit any earlier publication of an essay in the front or back matter.",
    ],
    keywords: ["essays", "essay collection", "personal essays", "cultural criticism", "reflections", "nonfiction essays", "collected writings"],
    coverLook: "quiet and literary, an abstract or still-life image with plenty of space, elegant serif lettering",
  },
];

export function genreById(id: string | undefined): Genre | undefined {
  return id ? GENRES.find((g) => g.id === id) : undefined;
}

export function genresIn(category: GenreCategory): Genre[] {
  return GENRES.filter((g) => g.category === category);
}

/** The genre guide as a line or two for the AI staff, so their advice fits the kind of book. */
export function genreContext(genre: Genre | undefined): string {
  if (!genre) return "";
  return `Genre: ${CATEGORY_LABEL[genre.category]}, ${genre.label}. Readers expect: ${genre.conventions.join(" ")}`;
}
