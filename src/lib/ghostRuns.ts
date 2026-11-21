import { useSyncExternalStore } from "react";
import type { AiSettings, Manuscript, Suggestion } from "@/db/schema";
import { requestWholeBookCorrections, type CorrectionsResult, type PlaceProblem } from "./ghostCorrections";

/**
 * The Ghostwriter's work on whole-book flags, kept outside any screen. A request keeps
 * running when the author moves between Edit and Write, and both screens show where it is.
 * The corrections themselves are saved in the database as they arrive, so they survive a reload.
 */

export interface GhostRun {
  busy: boolean;
  ok?: boolean;
  text?: string;
}

let runs: Record<string, GhostRun> = {};
const listeners = new Set<() => void>();

function set(flagId: string, run: GhostRun) {
  runs = { ...runs, [flagId]: run };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The same as useGhostRuns, read once outside a screen. */
export function currentGhostRuns(): Record<string, GhostRun> {
  return runs;
}

/** Where the Ghostwriter is with every whole-book flag sent to it this session, by flag id. */
export function useGhostRuns(): Record<string, GhostRun> {
  return useSyncExternalStore(subscribe, () => runs);
}

const WHY: Record<PlaceProblem, string> = {
  missing: "its wording isn't in the chapter",
  repeated: "the passage appears more than once",
  paragraphs: "it runs across two paragraphs",
};

/** What the Ghostwriter proposed, in words: how many corrections are ready, and how many are for the author to make by hand, and why. */
export function describeResult(result: CorrectionsResult): string {
  const total = result.saved + result.byHand.length;
  if (total === 0) return "The Ghostwriter found nothing it could correct. Try again, or fix it by hand.";
  const where = result.chapters.map((c) => c.title || "Untitled").join(", ");
  let text = `The Ghostwriter proposed ${total} ${total === 1 ? "correction" : "corrections"} in ${where}.`;
  if (result.byHand.length > 0) {
    const reasons = [...new Set(result.byHand)].map((p) => WHY[p]).join("; ");
    text +=
      result.byHand.length === total
        ? ` None could be matched to the text exactly (${reasons}), so each is shown for you to make by hand.`
        : ` ${result.byHand.length} couldn't be matched to the text exactly (${reasons}), so ${result.byHand.length === 1 ? "it is" : "they are"} shown for you to make by hand.`;
  }
  return text;
}

/**
 * Starts the Ghostwriter on a whole-book flag: it reads the chapters concerned and proposes
 * corrections. Does nothing while a request for the same flag is still running.
 */
export function startCorrections(settings: AiSettings | null | undefined, reachable: boolean, manuscript: Manuscript, flag: Suggestion): void {
  if (runs[flag.id]?.busy) return;
  if (!settings) return set(flag.id, { busy: false, ok: false, text: "Add your AI key in Settings first." });
  if (!reachable) return set(flag.id, { busy: false, ok: false, text: "You are offline. The Ghostwriter needs a connection." });
  set(flag.id, { busy: true });
  requestWholeBookCorrections(settings, manuscript, flag).then(
    (result) => {
      set(flag.id, { busy: false, ok: result.saved + result.byHand.length > 0, text: describeResult(result) });
    },
    (e: unknown) => set(flag.id, { busy: false, ok: false, text: e instanceof Error ? e.message : "The Ghostwriter could not answer." }),
  );
}
