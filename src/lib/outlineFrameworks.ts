import type { OutlineKind } from "@/db/schema";
import type { OutlineNode } from "./outline";

/** A well-known story or book structure that can be added to the outline as a starting frame. */
export interface OutlineFramework {
  id: string;
  label: string;
  category: "fiction" | "nonfiction";
  description: string;
  nodes: OutlineNode[];
}

type Part = [title: string, points: [title: string, summary: string][]];

function part(kind: OutlineKind, [title, points]: Part): OutlineNode {
  return {
    kind,
    title,
    summary: "",
    children: points.map(([pointTitle, summary]) => ({ kind: "beat" as const, title: pointTitle, summary, children: [] })),
  };
}

const acts = (...parts: Part[]): OutlineNode[] => parts.map((p) => part("act", p));
const chapters = (...parts: Part[]): OutlineNode[] => parts.map((p) => part("chapter", p));

export const OUTLINE_FRAMEWORKS: OutlineFramework[] = [
  {
    id: "three-act",
    label: "Three-act structure",
    category: "fiction",
    description: "The classic shape: setup, confrontation, resolution.",
    nodes: acts(
      ["Act I: Setup", [["Opening image", "Who the hero is and what their world looks like."], ["Inciting incident", "The event that disturbs the hero's world."], ["First plot point", "The hero commits to the story's problem."]]],
      ["Act II: Confrontation", [["Rising action", "Obstacles grow and the stakes rise."], ["Midpoint", "A turn that changes what the hero believes or wants."], ["Crisis", "The lowest point; everything seems lost."]]],
      ["Act III: Resolution", [["Climax", "The final confrontation."], ["Resolution", "The new normal."]]],
    ),
  },
  {
    id: "save-the-cat",
    label: "Save the Cat (15 beats)",
    category: "fiction",
    description: "Blake Snyder's beat sheet, popular for screenplays and commercial novels.",
    nodes: acts(
      ["Act I", [["Opening image", "A snapshot of the hero's life before."], ["Theme stated", "A hint of what the story is really about."], ["Set-up", "The hero's world, flaws and want."], ["Catalyst", "Life changes."], ["Debate", "Should the hero go?"]]],
      ["Act II", [["Break into two", "The hero enters the new world."], ["B story", "A new relationship carries the theme."], ["Fun and games", "The promise of the premise."], ["Midpoint", "A false victory or false defeat."], ["Bad guys close in", "Pressure from outside and inside."], ["All is lost", "The lowest moment."], ["Dark night of the soul", "The hero faces the truth."]]],
      ["Act III", [["Break into three", "The solution is found."], ["Finale", "The hero proves they have changed."], ["Final image", "The opposite of the opening image."]]],
    ),
  },
  {
    id: "heros-journey",
    label: "The Hero's Journey (12 stages)",
    category: "fiction",
    description: "Christopher Vogler's version of the monomyth.",
    nodes: acts(
      ["Departure", [["Ordinary world", "The hero's everyday life."], ["Call to adventure", "A problem or challenge appears."], ["Refusal of the call", "Fear holds the hero back."], ["Meeting the mentor", "Guidance and a gift."], ["Crossing the threshold", "The hero commits."]]],
      ["Initiation", [["Tests, allies, enemies", "The new world teaches its rules."], ["Approach to the inmost cave", "Preparing for the big challenge."], ["Ordeal", "The hero faces death or a great fear."], ["Reward", "The hero takes the prize."]]],
      ["Return", [["The road back", "The consequences of the ordeal."], ["Resurrection", "A final test that proves the change."], ["Return with the elixir", "The hero brings something home."]]],
    ),
  },
  {
    id: "seven-point",
    label: "Seven-point structure",
    category: "fiction",
    description: "Dan Wells' structure, built backwards from the resolution.",
    nodes: acts(
      ["Seven points", [["Hook", "The opposite of where the story will end."], ["Plot turn 1", "The call to adventure."], ["Pinch 1", "Pressure shows what the hero is up against."], ["Midpoint", "The hero moves from reacting to acting."], ["Pinch 2", "Things get worse; all seems lost."], ["Plot turn 2", "The final piece falls into place."], ["Resolution", "The story's problem is solved."]]],
    ),
  },
  {
    id: "story-circle",
    label: "Story circle (8 steps)",
    category: "fiction",
    description: "Dan Harmon's cycle: a character in a zone of comfort wants something and changes.",
    nodes: acts(
      ["The circle", [["You", "A character in a zone of comfort."], ["Need", "But they want something."], ["Go", "They enter an unfamiliar situation."], ["Search", "They adapt to it."], ["Find", "They get what they wanted."], ["Take", "They pay a heavy price."], ["Return", "They go back to where they started."], ["Change", "They have changed."]]],
    ),
  },
  {
    id: "freytag",
    label: "Freytag's pyramid",
    category: "fiction",
    description: "Five stages from exposition to denouement, suited to tragedy and literary fiction.",
    nodes: acts(
      ["Exposition", [["Setting and characters", "The world before the trouble."]]],
      ["Rising action", [["Complications", "Events build toward the turning point."]]],
      ["Climax", [["The turning point", "The moment everything turns."]]],
      ["Falling action", [["Consequences", "The results play out."]]],
      ["Denouement", [["Resolution", "The new order, and what it cost."]]],
    ),
  },
  {
    id: "romance-beats",
    label: "Romance beats",
    category: "fiction",
    description: "The emotional beats readers expect from a romance.",
    nodes: acts(
      ["Beginning", [["Setup", "Each lead's life and their fear of love."], ["Meet cute", "The leads meet."], ["No way", "Why they cannot be together."]]],
      ["Middle", [["Adhesion", "Something keeps them together."], ["Deepening", "They fall for each other."], ["Midpoint", "A kiss, or a first real step."], ["Retreat", "Fear pulls them apart."]]],
      ["End", [["Black moment", "All seems lost."], ["Grand gesture", "One lead risks everything."], ["Happily ever after", "A satisfying ending."]]],
    ),
  },
  {
    id: "problem-solution",
    label: "Problem and solution",
    category: "nonfiction",
    description: "For self-help and business books: name the problem, then walk the reader to the answer.",
    nodes: chapters(
      ["Introduction: the problem", [["The reader's struggle", "Describe the problem in the reader's words."], ["Why it matters", "The cost of leaving it unsolved."], ["Your promise", "What the book will help them do."]]],
      ["Why the usual answers fail", [["Common advice", "What most people try."], ["What is missing", "The gap your approach fills."]]],
      ["The solution", [["The core idea", "Your method in one clear statement."], ["The steps", "How to apply it."], ["Proof", "Stories, data or examples that it works."]]],
      ["Putting it into practice", [["First actions", "What to do this week."], ["Pitfalls", "Where people go wrong."]]],
      ["Conclusion", [["Recap", "The main points."], ["Call to action", "The one thing to do next."]]],
    ),
  },
  {
    id: "how-to-guide",
    label: "How-to guide",
    category: "nonfiction",
    description: "A practical book that teaches a skill step by step.",
    nodes: chapters(
      ["Introduction", [["Who this book is for", "The reader and their starting point."], ["What you will be able to do", "The result by the last page."]]],
      ["The basics", [["Key terms", "Words the reader needs."], ["What you need", "Tools and materials."]]],
      ["Step by step", [["Step 1", "The first thing to do."], ["Step 2", "The next thing."], ["Step 3", "And the next."]]],
      ["Troubleshooting", [["Common mistakes", "What goes wrong and how to fix it."]]],
      ["Going further", [["Next steps", "Where to learn more."]]],
    ),
  },
  {
    id: "memoir-arc",
    label: "Memoir arc",
    category: "nonfiction",
    description: "A life story shaped around one question or turning point.",
    nodes: chapters(
      ["Before", [["The world I came from", "People, place and the way things were."], ["What I wanted", "The longing that drives the story."]]],
      ["The break", [["The event", "The moment that changed everything."], ["The fallout", "How life was different afterward."]]],
      ["The struggle", [["Attempts and setbacks", "What I tried and what it cost."], ["The low point", "When I could go no further."]]],
      ["After", [["What changed", "How I became someone different."], ["What I know now", "The truth the story earned."]]],
    ),
  },
];

export function frameworkById(id: string): OutlineFramework | undefined {
  return OUTLINE_FRAMEWORKS.find((f) => f.id === id);
}
