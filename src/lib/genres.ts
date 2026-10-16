/**
 * The genre guide. When a manuscript is created the author picks fiction or
 * non-fiction and then a genre; the genre gives the book a target length, a
 * ready-made outline structure, the conventions readers expect, keywords for
 * the store page, a look for the cover and a suggested format preset
 * (src/lib/formatPresets.ts, presetForGenre). The chosen genre id is stored on
 * the manuscript (`Manuscript.genre`).
 *
 * The genre list follows the book categories used by Reedsy (reedsy.com), with
 * the fiction and non-fiction groups kept apart. It was written into the app by
 * hand from those categories; it was not downloaded, so check the names against
 * reedsy.com if the list is ever updated.
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
  {
    id: "action",
    category: "fiction",
    label: "Action and adventure",
    summary: "A hero races against time, danger and a powerful opponent, with physical stakes on every page.",
    lengthNote: "70,000 to 100,000 words",
    targetWords: 85000,
    structure: [
      { title: "Act I: The call", points: ["The hero and what they stand to lose", "The inciting danger", "The commitment to act"] },
      { title: "Act II: The chase", points: ["Escalating set pieces", "A rival or ally revealed", "Midpoint reversal", "The lowest point"] },
      { title: "Act III: The final stand", points: ["The plan that works, then fails", "The climax", "The aftermath"] },
    ],
    conventions: [
      "Keep the action clear: the reader should always know where people are and what is at stake.",
      "Vary the set pieces so each one raises the stakes or shows the hero differently.",
      "Let the hero's skills and flaws decide how the danger is faced.",
    ],
    keywords: ["action", "adventure", "action thriller", "survival", "race against time", "heroes", "action adventure"],
    coverLook: "dynamic and cinematic, a hero mid-motion or a dramatic landscape, bold saturated colours, heavy blocky lettering",
  },
  {
    id: "urbanfantasy",
    category: "fiction",
    label: "Urban fantasy",
    summary: "Magic and monsters hidden inside a modern city, usually seen through a wry, street-smart protagonist.",
    lengthNote: "80,000 to 100,000 words",
    targetWords: 90000,
    structure: [
      { title: "Act I: The hidden city", points: ["The protagonist's ordinary but strange life", "The supernatural problem arrives", "The protagonist is pulled in"] },
      { title: "Act II: Learning the rules", points: ["Allies and dangerous factions", "The rules of the hidden world", "Midpoint: a secret about the protagonist", "The city turns against them"] },
      { title: "Act III: The reckoning", points: ["The final confrontation in the city", "The price of victory", "A world changed for good"] },
    ],
    conventions: [
      "Ground the magic in real city places and everyday details.",
      "Keep the voice distinct and witty without losing the threat.",
      "Set clear rules for the hidden world and for who keeps them.",
    ],
    keywords: ["urban fantasy", "paranormal fantasy", "magic in the city", "supernatural", "modern fantasy", "monsters", "urban magic"],
    coverLook: "moody city at night, a lone figure with a glowing or supernatural detail, neon and shadow, stylish condensed lettering",
  },
  {
    id: "dystopian",
    category: "fiction",
    label: "Dystopian",
    summary: "A society built on control, injustice or collapse, and the people who try to break it.",
    lengthNote: "75,000 to 95,000 words",
    targetWords: 85000,
    structure: [
      { title: "Act I: The broken world", points: ["Daily life under the system", "The crack that shows the truth", "The decision to resist"] },
      { title: "Act II: Resistance", points: ["Recruiting and testing allies", "The system's response", "Midpoint: the big reveal", "The cost of resistance"] },
      { title: "Act III: Change or survival", points: ["The decisive uprising", "The price of change", "The world that comes after"] },
    ],
    conventions: [
      "Make the system's logic feel plausible from the inside.",
      "Keep the focus on a few characters' choices rather than on the whole world.",
      "Let the rules of the society show in small everyday details.",
    ],
    keywords: ["dystopian", "dystopia", "post-apocalyptic", "rebellion", "totalitarian", "survival fiction", "future society"],
    coverLook: "bleak and stark, a single figure or symbol against grey or rust-coloured skies, distressed texture, bold industrial lettering",
  },
  {
    id: "contemporary",
    category: "fiction",
    label: "Contemporary fiction",
    summary: "Stories set in the present day about ordinary people facing change, choice and connection.",
    lengthNote: "70,000 to 90,000 words",
    targetWords: 80000,
    structure: [
      { title: "Act I: Ordinary life", points: ["The character's routine and its cracks", "The event that changes things", "Deciding what to do"] },
      { title: "Act II: Pressure", points: ["Old and new relationships tested", "A secret or misunderstanding surfaces", "Midpoint shift", "Things fall apart"] },
      { title: "Act III: Reckoning", points: ["Facing the truth", "A changed choice", "A hopeful or honest ending"] },
    ],
    conventions: [
      "Make the setting specific and recognisable.",
      "Let character drive the plot more than coincidence does.",
      "Endings can be hopeful or bittersweet, but they must be earned.",
    ],
    keywords: ["contemporary fiction", "modern fiction", "family drama", "relationships", "realistic fiction", "book club", "life changes"],
    coverLook: "clean and contemporary, a simple photographic or illustrated scene with plenty of space, modern sans-serif lettering",
  },
  {
    id: "womens",
    category: "fiction",
    label: "Women's fiction",
    summary: "Novels about a woman's life, relationships and reinvention, with the emotional journey at the centre.",
    lengthNote: "80,000 to 100,000 words",
    targetWords: 90000,
    structure: [
      { title: "Act I: Her life before", points: ["Her world and what she has lost or lacks", "The event that forces change", "Her first step"] },
      { title: "Act II: Reinvention", points: ["Friendships and family tested", "A new relationship or opportunity", "Midpoint: a painful truth", "The lowest point"] },
      { title: "Act III: On her own terms", points: ["Facing the past", "The choice that defines her", "A new beginning"] },
    ],
    conventions: [
      "The protagonist's inner journey drives the plot.",
      "Relationships with friends and family matter as much as romance.",
      "Honest emotion and a satisfying, grounded ending.",
    ],
    keywords: ["women's fiction", "book club fiction", "life changes", "friendship", "family drama", "second chances", "emotional fiction"],
    coverLook: "warm and emotional, a woman in a home or outdoor setting, soft natural light, elegant script or serif lettering",
  },
  {
    id: "paranormal",
    category: "fiction",
    label: "Paranormal",
    summary: "Ghosts, shifters, witches or other supernatural beings in a story of love, danger or mystery.",
    lengthNote: "70,000 to 90,000 words",
    targetWords: 80000,
    structure: [
      { title: "Act I: The uncanny arrives", points: ["The protagonist's normal life", "A supernatural encounter", "The secret world opens"] },
      { title: "Act II: Rules and risk", points: ["Learning the rules and factions", "The attraction or threat grows", "Midpoint revelation", "Danger closes in"] },
      { title: "Act III: Resolution", points: ["The confrontation", "The cost of the bond or the truth", "What the new world means"] },
    ],
    conventions: [
      "Give the supernatural clear rules and limits.",
      "Pair the uncanny with a human emotional story.",
      "Match the heat level and tone to the subgenre readers expect.",
    ],
    keywords: ["paranormal", "paranormal romance", "supernatural", "ghosts", "witches", "shapeshifters", "vampires"],
    coverLook: "atmospheric and mysterious, a silhouette with a supernatural touch such as mist, moon or glowing eyes, deep jewel colours, gothic lettering",
  },
  {
    id: "cozy",
    category: "fiction",
    label: "Cozy mystery",
    summary: "A small-town or close-knit mystery with a likeable amateur sleuth, where the crime is solved without graphic violence.",
    lengthNote: "60,000 to 75,000 words",
    targetWords: 65000,
    structure: [
      { title: "Act I: The murder", points: ["The sleuth and their community", "The body is found", "The sleuth is drawn in"] },
      { title: "Act II: The investigation", points: ["Suspects with motives", "Clues and red herrings", "A second incident", "The sleuth is in danger"] },
      { title: "Act III: The solution", points: ["The missing clue", "The reveal in front of everyone", "The community restored"] },
    ],
    conventions: [
      "Keep the violence off the page and the tone warm.",
      "Give the sleuth a hobby, shop or community role that the story uses.",
      "Play fair: every clue must be on the page for the reader.",
    ],
    keywords: ["cozy mystery", "amateur sleuth", "small town mystery", "murder mystery", "whodunit", "cozy crime", "village mystery"],
    coverLook: "charming and warm, an illustrated village or shop scene with a hint of mystery, pastel or rich colours, playful lettering",
  },
  {
    id: "humor",
    category: "fiction",
    label: "Humor and satire",
    summary: "Comic fiction that makes people laugh, or uses wit to expose folly.",
    lengthNote: "50,000 to 80,000 words",
    targetWords: 65000,
    structure: [
      { title: "Act I: The setup", points: ["The comic situation and its premise", "The inciting mishap", "The decision that makes it worse"] },
      { title: "Act II: Escalation", points: ["Each attempt to fix it makes things worse", "A rival or accomplice joins", "Midpoint twist", "Everything collapses"] },
      { title: "Act III: The payoff", points: ["The grand finale", "A clever resolution", "A satisfying last joke"] },
    ],
    conventions: [
      "Build comedy from character and a clear premise, not from random jokes.",
      "Escalate: each complication should be bigger than the last.",
      "Keep the voice consistent and sharp.",
    ],
    keywords: ["humor", "comedy", "satire", "funny novel", "comic fiction", "satirical", "light comedy"],
    coverLook: "playful and bold, a caricature or witty illustration, bright colour blocks, big cheerful lettering",
  },
  {
    id: "lgbtq",
    category: "fiction",
    label: "LGBTQ+ fiction",
    summary: "Stories centred on queer characters and lives, in any genre.",
    lengthNote: "60,000 to 100,000 words",
    targetWords: 80000,
    structure: [
      { title: "Act I: Who they are", points: ["The character's life and the truth they hide or explore", "The event that brings love or change", "The decision to act"] },
      { title: "Act II: Finding community", points: ["Relationships and risk", "Support and opposition", "Midpoint: a turn in the relationship", "The lowest point"] },
      { title: "Act III: Living openly", points: ["The decisive moment", "The cost and the gain", "A hopeful future"] },
    ],
    conventions: [
      "Write queer characters as full people, not only through their identity.",
      "Give the community and found family real weight.",
      "Choose the ending that is true to the characters.",
    ],
    keywords: ["LGBTQ", "queer fiction", "gay romance", "lesbian fiction", "coming out", "found family", "queer literature"],
    coverLook: "warm and inclusive, two or more figures together in a bright setting, rainbow or soft pastel accents, clean lettering",
  },
  {
    id: "western",
    category: "fiction",
    label: "Western",
    summary: "Frontier stories of land, law, outlaws and survival, set in the American West or somewhere like it.",
    lengthNote: "70,000 to 90,000 words",
    targetWords: 80000,
    structure: [
      { title: "Act I: The frontier", points: ["The protagonist and the land", "The event that breaks the peace", "The vow to see it through"] },
      { title: "Act II: The trail", points: ["Hardships and enemies", "Allies gained and lost", "Midpoint: a betrayal", "The darkest night"] },
      { title: "Act III: The showdown", points: ["The final confrontation", "The cost of justice", "The settling of the land"] },
    ],
    conventions: [
      "Make the landscape and the hard daily work vivid.",
      "Keep the code of honour central to the conflict.",
      "Let dialogue sound of its time without being hard to read.",
    ],
    keywords: ["western", "frontier", "cowboys", "outlaws", "wild west", "range war", "historical western"],
    coverLook: "wide open landscape at dusk, a lone rider or town silhouette, warm earth tones, rugged slab-serif lettering",
  },
  {
    id: "christian",
    category: "fiction",
    label: "Christian fiction",
    summary: "Stories of faith, struggle and grace, in which belief shapes the characters' choices.",
    lengthNote: "70,000 to 90,000 words",
    targetWords: 80000,
    structure: [
      { title: "Act I: Life before grace", points: ["The character's need or wound", "The event that raises the question of faith", "The first step toward change"] },
      { title: "Act II: The struggle", points: ["Doubt and temptation", "Those who help and those who oppose", "Midpoint turn toward faith", "The darkest moment"] },
      { title: "Act III: Redemption", points: ["The moment of choice", "Grace received and given", "A renewed life"] },
    ],
    conventions: [
      "Show faith through choices rather than sermons.",
      "Honest struggle makes the faith believable.",
      "Keep to the content and tone your readers expect.",
    ],
    keywords: ["Christian fiction", "inspirational fiction", "faith", "redemption", "Christian romance", "hope", "spiritual journey"],
    coverLook: "gentle and hopeful, a landscape or symbolic image with light breaking through, soft colours, elegant serif lettering",
  },
  {
    id: "shortstories",
    category: "fiction",
    label: "Short stories",
    summary: "A collection of self-contained stories, linked by theme, voice or setting.",
    lengthNote: "20,000 to 60,000 words",
    targetWords: 40000,
    structure: [
      { title: "Opening story: The first voice", points: ["A strong first line and a complete arc", "Setting up the collection's theme"] },
      { title: "Middle stories: Variety", points: ["Stories of different length and tone", "A story that breaks the pattern", "A story that deepens the theme"] },
      { title: "Closing story: Resonance", points: ["The strongest story to end on", "A final image that echoes the first"] },
    ],
    conventions: [
      "Each story needs a complete arc in a few pages.",
      "Order the stories so each one changes how the next is read.",
      "Credit any earlier publication of a story in the front or back matter.",
    ],
    keywords: ["short stories", "story collection", "fiction collection", "linked stories", "flash fiction", "literary short stories", "anthology"],
    coverLook: "artful and minimal, a single bold image or abstract shape, generous space, refined lettering",
  },
  {
    id: "magicalrealism",
    category: "fiction",
    label: "Magical realism",
    summary: "Ordinary life in a real place, where the marvellous happens without surprise.",
    lengthNote: "70,000 to 100,000 words",
    targetWords: 85000,
    structure: [
      { title: "Part one: The family and the place", points: ["The setting and its people", "The first marvel, taken as normal", "The family's secret or history"] },
      { title: "Part two: Generations", points: ["Marvels and hardships", "Time moves in loops or leaps", "Midpoint: the marvel with a cost", "Loss and decline"] },
      { title: "Part three: What remains", points: ["The final revelation", "The cycle closes", "A resonant last image"] },
    ],
    conventions: [
      "Treat the marvellous as ordinary; never explain it away.",
      "Ground the magic in concrete, sensory detail.",
      "Let the story speak to history, family or politics through the magic.",
    ],
    keywords: ["magical realism", "literary fantasy", "family saga", "multigenerational", "lyrical fiction", "myth and history", "magic realism"],
    coverLook: "dreamlike and warm, a domestic scene with one impossible detail such as a floating object or bird, rich colours, flowing lettering",
  },

  // ---- Non-fiction (additional) ----
  {
    id: "truecrime",
    category: "nonfiction",
    label: "True crime",
    summary: "A real crime, investigated and told as narrative, with the people and the justice system at its heart.",
    lengthNote: "70,000 to 90,000 words",
    targetWords: 80000,
    structure: [
      { title: "Chapter 1: The crime", points: ["The event and the victims", "The first clues and the first doubt"] },
      { title: "Chapter 2: The investigation", points: ["Detectives and their methods", "Key evidence and suspects"] },
      { title: "Chapter 3: The trial", points: ["Courtroom turns", "The verdict and its doubts"] },
      { title: "Chapter 4: The aftermath", points: ["Families and communities", "What the case changed"] },
    ],
    conventions: [
      "Verify every fact against court records and reliable reporting.",
      "Treat victims and families with dignity and privacy.",
      "Be clear about what is proven and what is only alleged.",
    ],
    keywords: ["true crime", "criminal investigation", "murder cases", "crime nonfiction", "unsolved", "justice", "forensic"],
    coverLook: "dark and documentary, an archival photograph or evidence-style image, muted palette with one red accent, condensed sans-serif lettering",
  },
  {
    id: "religion",
    category: "nonfiction",
    label: "Religion and spirituality",
    summary: "Faith, practice, belief or the spiritual life, explained and applied for readers.",
    lengthNote: "40,000 to 70,000 words",
    targetWords: 55000,
    structure: [
      { title: "Introduction: The question", points: ["The spiritual question the book addresses", "Your own journey and approach"] },
      { title: "Part 1: Foundations", points: ["The core teaching or practice", "Its history and sources"] },
      { title: "Part 2: Practice", points: ["Daily or weekly application", "Stories and examples"] },
      { title: "Part 3: Living it", points: ["Obstacles and how to meet them", "Community and growth"] },
      { title: "Conclusion: The way forward", points: ["The key takeaways", "An invitation to practice"] },
    ],
    conventions: [
      "Respect the traditions you write about and cite your sources.",
      "Mix teaching, personal story and practical exercises.",
      "Say who the book is written for.",
    ],
    keywords: ["religion", "spirituality", "faith", "prayer", "meditation", "spiritual growth", "inspirational nonfiction"],
    coverLook: "serene and reflective, a natural or sacred symbol in soft light, calm palette, classic serif lettering",
  },
  {
    id: "health",
    category: "nonfiction",
    label: "Health and fitness",
    summary: "Practical guidance on the body, diet, exercise or wellbeing, with a clear plan.",
    lengthNote: "40,000 to 60,000 words",
    targetWords: 50000,
    structure: [
      { title: "Introduction: The promise", points: ["The health goal and why it matters", "What the reader will do"] },
      { title: "Chapter 1: The science", points: ["How the body responds", "Myths to clear up"] },
      { title: "Chapter 2: The plan", points: ["The step-by-step programme", "Measuring progress"] },
      { title: "Chapter 3: Staying on track", points: ["Habits and motivation", "Setbacks and plateaus"] },
      { title: "Conclusion: Lifelong health", points: ["Summary of the plan", "Next steps"] },
    ],
    conventions: [
      "Cite research and avoid overstated medical claims.",
      "Say plainly that the book does not replace medical advice.",
      "Make the plan specific, measurable and easy to follow.",
    ],
    keywords: ["health", "fitness", "wellness", "exercise", "nutrition", "healthy habits", "workout plan"],
    coverLook: "fresh and energetic, a clean photograph of movement or healthy food, bright colours, modern sans-serif lettering",
  },
  {
    id: "parenting",
    category: "nonfiction",
    label: "Parenting and family",
    summary: "Advice, stories and strategies for raising children and running a family.",
    lengthNote: "40,000 to 60,000 words",
    targetWords: 50000,
    structure: [
      { title: "Introduction: Why this matters", points: ["The parenting challenge", "Your approach and experience"] },
      { title: "Chapter 1: Understanding children", points: ["Development and what it means", "Common misunderstandings"] },
      { title: "Chapter 2: Practical strategies", points: ["Step-by-step approaches", "Examples from real families"] },
      { title: "Chapter 3: Hard moments", points: ["Tantrums, conflict and screens", "Looking after yourself"] },
      { title: "Conclusion: The long view", points: ["Key takeaways", "Encouragement for the journey"] },
    ],
    conventions: [
      "Be warm and non-judgemental: every family is different.",
      "Use real examples and clear, usable strategies.",
      "Where relevant, say when to seek professional help.",
    ],
    keywords: ["parenting", "parenting advice", "raising children", "family life", "child development", "positive parenting", "kids"],
    coverLook: "warm and homely, a family moment in natural light, soft colours, friendly rounded lettering",
  },
  {
    id: "finance",
    category: "nonfiction",
    label: "Personal finance",
    summary: "How to earn, save, spend, invest and plan for money, in plain language.",
    lengthNote: "40,000 to 60,000 words",
    targetWords: 50000,
    structure: [
      { title: "Introduction: Your money now", points: ["The financial problem", "The approach and its limits"] },
      { title: "Chapter 1: The foundations", points: ["Budgets and cash flow", "Debt and savings"] },
      { title: "Chapter 2: Building wealth", points: ["Investing basics", "Risk and time"] },
      { title: "Chapter 3: Protecting what you have", points: ["Insurance and emergencies", "Taxes and planning"] },
      { title: "Conclusion: Your plan", points: ["A simple action plan", "Review and adjust"] },
    ],
    conventions: [
      "Explain terms the first time you use them.",
      "Do not promise guaranteed returns; state the risks.",
      "Include worked examples with real numbers.",
    ],
    keywords: ["personal finance", "money", "investing", "budgeting", "saving", "financial freedom", "debt free"],
    coverLook: "clean and confident, a simple graphic of growth or coins, navy and gold palette, crisp sans-serif lettering",
  },
  {
    id: "politics",
    category: "nonfiction",
    label: "Politics and society",
    summary: "Ideas, public life and the forces that shape how societies are governed and argued about.",
    lengthNote: "60,000 to 90,000 words",
    targetWords: 70000,
    structure: [
      { title: "Introduction: The argument", points: ["The question and your thesis", "Why it matters now"] },
      { title: "Part 1: Background", points: ["The history and the institutions", "Competing views"] },
      { title: "Part 2: Evidence", points: ["Case studies", "Data and research"] },
      { title: "Part 3: Implications", points: ["What follows from the argument", "Objections and replies"] },
      { title: "Conclusion: What to do", points: ["The argument in short", "Where the debate goes next"] },
    ],
    conventions: [
      "State your argument clearly and engage the strongest opposing views.",
      "Support claims with evidence and cite sources.",
      "Be fair to people you disagree with.",
    ],
    keywords: ["politics", "public policy", "society", "democracy", "social science", "political science", "current affairs"],
    coverLook: "bold and serious, a striking symbolic image or documentary photograph, strong contrast, classic or condensed lettering",
  },
  {
    id: "education",
    category: "nonfiction",
    label: "Education and teaching",
    summary: "Guidance for teachers, parents and learners on how people learn and how to teach well.",
    lengthNote: "40,000 to 70,000 words",
    targetWords: 55000,
    structure: [
      { title: "Introduction: The problem of learning", points: ["What the book helps the reader do", "Your evidence and experience"] },
      { title: "Chapter 1: How people learn", points: ["The research in plain language", "Common myths"] },
      { title: "Chapter 2: Practice", points: ["Strategies that work", "Classroom or home examples"] },
      { title: "Chapter 3: Assessment and feedback", points: ["Measuring learning", "Giving useful feedback"] },
      { title: "Conclusion: Going forward", points: ["Key principles", "Tools to use tomorrow"] },
    ],
    conventions: [
      "Ground advice in research, and say how strong the evidence is.",
      "Give concrete classroom or home examples.",
      "End each chapter with a practical tool or checklist.",
    ],
    keywords: ["education", "teaching", "learning", "teachers", "classroom", "school", "study skills"],
    coverLook: "bright and encouraging, an illustrated classroom or open book with simple shapes, cheerful colours, friendly lettering",
  },
  {
    id: "technology",
    category: "nonfiction",
    label: "Computers and technology",
    summary: "How computers, software, the internet and digital tools work, and how to use them well.",
    lengthNote: "40,000 to 70,000 words",
    targetWords: 55000,
    structure: [
      { title: "Introduction: The big picture", points: ["The technology and who it is for", "What the reader will be able to do"] },
      { title: "Chapter 1: The basics", points: ["Core concepts in plain language", "The tools you need"] },
      { title: "Chapter 2: Doing it", points: ["Step-by-step walk-throughs", "Common mistakes"] },
      { title: "Chapter 3: Going further", points: ["Advanced techniques", "Security and privacy"] },
      { title: "Appendix: Reference", points: ["Glossary", "Further resources"] },
    ],
    conventions: [
      "Test every step on the version of the software the reader will use.",
      "Explain jargon when it first appears.",
      "Include screenshots or diagrams where they help.",
    ],
    keywords: ["computers", "technology", "software", "programming", "tech guide", "digital skills", "how to use computers"],
    coverLook: "crisp and modern, a clean device or abstract circuit graphic, cool blue and white palette, sleek sans-serif lettering",
  },
  {
    id: "sports",
    category: "nonfiction",
    label: "Sports and recreation",
    summary: "Sport, games, outdoor pursuits and the people who play them, told or taught.",
    lengthNote: "50,000 to 80,000 words",
    targetWords: 65000,
    structure: [
      { title: "Introduction: The game", points: ["Why this sport or pursuit matters", "The story or skill the book covers"] },
      { title: "Chapter 1: Origins", points: ["The history and the early players", "The rules and culture"] },
      { title: "Chapter 2: The craft", points: ["Technique and training", "The mental game"] },
      { title: "Chapter 3: The big moments", points: ["Key matches, races or expeditions", "Rivals and teammates"] },
      { title: "Conclusion: What it teaches", points: ["The lessons learned", "Getting started"] },
    ],
    conventions: [
      "Bring the action alive with vivid detail.",
      "Get the rules and facts right; enthusiasts will check.",
      "Balance the story of the sport with the people in it.",
    ],
    keywords: ["sports", "recreation", "outdoors", "games", "athletes", "training", "sports history"],
    coverLook: "dynamic and energetic, an action photograph or silhouette, strong colour, bold condensed lettering",
  },
  {
    id: "nature",
    category: "nonfiction",
    label: "Nature and environment",
    summary: "The natural world, wildlife and the environment, explained with wonder and care.",
    lengthNote: "50,000 to 80,000 words",
    targetWords: 65000,
    structure: [
      { title: "Introduction: A place or a question", points: ["What the reader will discover", "Why it matters"] },
      { title: "Part 1: How it works", points: ["The ecology in plain language", "The key species or processes"] },
      { title: "Part 2: What is changing", points: ["Pressures and evidence", "Stories from the field"] },
      { title: "Part 3: What we can do", points: ["Solutions and their limits", "How readers can take part"] },
      { title: "Conclusion: The living world", points: ["The big picture", "An invitation to look closer"] },
    ],
    conventions: [
      "Use vivid observation and first-hand detail.",
      "Be accurate about what is proven and what is debated.",
      "Give readers a way to act or to look more closely.",
    ],
    keywords: ["nature", "environment", "wildlife", "ecology", "conservation", "climate", "outdoors"],
    coverLook: "breathtaking and natural, a landscape or wildlife photograph, earthy greens and blues, clean elegant lettering",
  },
  {
    id: "philosophy",
    category: "nonfiction",
    label: "Philosophy",
    summary: "Ideas about how to live, know and reason, presented clearly for general readers.",
    lengthNote: "40,000 to 70,000 words",
    targetWords: 55000,
    structure: [
      { title: "Introduction: The question", points: ["The philosophical problem", "Why it matters in ordinary life"] },
      { title: "Chapter 1: The traditional answers", points: ["The main positions and their origins", "Strengths and weaknesses"] },
      { title: "Chapter 2: A closer look", points: ["The key argument step by step", "Examples and thought experiments"] },
      { title: "Chapter 3: Objections", points: ["The strongest challenges", "Replies"] },
      { title: "Conclusion: Your own view", points: ["Where the argument leads", "Questions to keep thinking about"] },
    ],
    conventions: [
      "Define terms and set out each argument step by step.",
      "Use examples and thought experiments to make ideas concrete.",
      "Present opposing positions fairly before you answer them.",
    ],
    keywords: ["philosophy", "ethics", "critical thinking", "ideas", "meaning of life", "logic", "introduction to philosophy"],
    coverLook: "minimal and thoughtful, a simple abstract or classical bust, generous space, refined serif lettering",
  },
  {
    id: "art",
    category: "nonfiction",
    label: "Art and photography",
    summary: "Art, design, photography and creative practice, taught or shown.",
    lengthNote: "40,000 to 70,000 words plus images",
    targetWords: 50000,
    structure: [
      { title: "Introduction: A way of seeing", points: ["What the book teaches", "Your own practice"] },
      { title: "Chapter 1: Foundations", points: ["Key principles", "Tools and materials"] },
      { title: "Chapter 2: Technique", points: ["Step-by-step exercises", "Examples of finished work"] },
      { title: "Chapter 3: Developing your style", points: ["Influences and experiments", "Critique and feedback"] },
      { title: "Conclusion: Keep making", points: ["Projects to try", "Resources"] },
    ],
    conventions: [
      "Pair every technique with an image or an example.",
      "Give exercises the reader can finish.",
      "Credit and license every image you reproduce.",
    ],
    keywords: ["art", "photography", "drawing", "painting", "design", "creative", "art techniques"],
    coverLook: "visually rich, a striking artwork or photograph used as the cover image, minimal lettering that leaves the art room",
  },
];

export function genreById(id: string | undefined): Genre | undefined {
  return id ? GENRES.find((g) => g.id === id) : undefined;
}

/** The genres of one kind of book, A to Z, for the genre menu. */
export function genresIn(category: GenreCategory): Genre[] {
  return GENRES.filter((g) => g.category === category).sort((a, b) => a.label.localeCompare(b.label));
}

/** The genre guide as a line or two for the AI staff, so their advice fits the kind of book. */
export function genreContext(genre: Genre | undefined): string {
  if (!genre) return "";
  return `Genre: ${CATEGORY_LABEL[genre.category]}, ${genre.label}. Readers expect: ${genre.conventions.join(" ")}`;
}
