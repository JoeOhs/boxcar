import { useSyncExternalStore } from "react";
import type { AiSettings, Manuscript, Suggestion } from "@/db/schema";
import { requestWholeBookCorrections } from "./ghostCorrections";

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
      const where = result.chapters.map((c) => c.title || "Untitled").join(", ");
      const skipped =
        result.dropped === 0
          ? ""
          : result.dropped === 1
            ? " One other correction quoted text that isn't in its chapter, so it was left out."
            : ` ${result.dropped} other corrections quoted text that isn't in their chapters, so they were left out.`;
      set(flag.id, {
        busy: false,
        ok: result.saved > 0,
        text:
          result.saved > 0
            ? `The Ghostwriter proposed ${result.saved} ${result.saved === 1 ? "correction" : "corrections"} in ${where}.${skipped}`
            : `The Ghostwriter found no correction it could make safely.${skipped} Try again, or fix it by hand.`,
      });
    },
    (e: unknown) => set(flag.id, { busy: false, ok: false, text: e instanceof Error ? e.message : "The Ghostwriter could not answer." }),
  );
}
