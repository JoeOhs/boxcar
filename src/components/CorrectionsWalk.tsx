import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, RotateCcw, X } from "lucide-react";
import { db, type Id, type Suggestion } from "@/db/schema";
import { aiReachable, useAiSettings } from "@/lib/ai";
import { briefOrder, expandChapterRefs } from "@/lib/chapterRefs";
import { settingsForStage, useEditModels } from "@/lib/editing";
import { settleFlagIfDone } from "@/lib/ghostCorrections";
import { startCorrections, useGhostRuns } from "@/lib/ghostRuns";
import { useChapters, useOnline } from "@/lib/hooks";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";

/** Types a correction's new wording out a few characters at a time, like the Ghostwriter's other writing. */
function useTyped(text: string, key: string): { shown: string; done: boolean } {
  const [count, setCount] = useState(0);
  useEffect(() => setCount(0), [key]);
  useEffect(() => {
    if (count >= text.length) return;
    const timer = window.setTimeout(() => setCount((c) => Math.min(text.length, c + Math.max(2, Math.ceil(text.length / 60)))), 30);
    return () => window.clearTimeout(timer);
  }, [count, text]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

/**
 * The Ghostwriter working through a whole-book flag, in its own space. It reads the chapters
 * concerned, then goes through its corrections one at a time: the writing space turns to each
 * correction's chapter, the new wording is typed out, and the author accepts or rejects it.
 * The next one waiting is always the one shown, so leaving and coming back picks up where it was.
 */
export function CorrectionsWalk({
  flagId,
  chapterId,
  onShowChapter,
  onApply,
  onClose,
}: {
  flagId: Id;
  /** The chapter open in the writing space. */
  chapterId: Id | null;
  /** Turns the writing space to a chapter. */
  onShowChapter: (chapterId: Id) => void;
  /** Applies a correction to the chapter; returns a message when it could not be applied. */
  onApply: (correction: Suggestion) => Promise<string | null>;
  onClose: () => void;
}) {
  const { manuscript, navigate } = useApp();
  const ai = useAiSettings();
  const models = useEditModels();
  const online = useOnline();
  const runs = useGhostRuns();
  const run = runs[flagId];
  const chapters = useChapters(manuscript?.id ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const data = useLiveQuery(async () => {
    const flag = await db.suggestions.get(flagId);
    const corrections = flag ? await db.suggestions.where("manuscriptId").equals(flag.manuscriptId).filter((s) => s.forFlag === flagId).toArray() : [];
    return { flag, corrections };
  }, [flagId]);

  const ordered = briefOrder(chapters ?? []);
  const place = (s: Suggestion) => ordered.findIndex((c) => c.id === s.chapterId);
  // Book order, then the order the Ghostwriter gave them.
  const corrections = [...(data?.corrections ?? [])].sort((a, b) => place(a) - place(b) || a.createdAt - b.createdAt);
  const pending = corrections.filter((c) => c.status === "pending");
  const current = pending[0];
  const typed = useTyped(current?.replacement ?? "", current?.id ?? "");

  // The writing space follows the correction being worked on.
  useEffect(() => {
    if (current && current.chapterId !== chapterId) onShowChapter(current.chapterId);
  }, [current?.id, chapterId]);

  if (!data || !manuscript) return null;
  const { flag } = data;
  const chapterName = (id: Id) => ordered.find((c) => c.id === id)?.title || "Untitled";

  async function accept(c: Suggestion) {
    setWorking(true);
    setProblem(null);
    const message = await onApply(c);
    if (message) setProblem(message);
    setWorking(false);
  }

  async function reject(c: Suggestion) {
    setProblem(null);
    await db.suggestions.update(c.id, { status: "rejected" });
    await settleFlagIfDone(c);
  }

  function retry() {
    if (!flag || !manuscript) return;
    startCorrections(ai ? settingsForStage(ai, models ?? {}, "ghostwriter") : ai, aiReachable(ai, online), manuscript, flag);
  }

  return (
    <div className="space-y-3 px-5 py-4 text-sm" aria-label="The Ghostwriter working through a flag">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-warning">Ghostwriter · working through a whole-book flag</p>
        <button className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Close" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      {flag ? (
        <p className="rounded-md border border-border bg-card px-3 py-2">
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{flag.agent ?? "Developmental editor"}</span>
          {expandChapterRefs(flag.comment.replace(/^Whole book:\s*/, ""), ordered)}
        </p>
      ) : null}

      {run?.busy ? <p className="animate-pulse text-muted-foreground">The Ghostwriter is reading the chapters concerned…</p> : null}
      {run && !run.busy && run.text && !run.ok ? (
        <div className="space-y-2">
          <p className="text-destructive">{run.text}</p>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCcw /> Try again
          </Button>
        </div>
      ) : null}
      {flag?.ghostPlan ? (
        <p className="text-xs">
          <span className="font-medium">The plan:</span> {flag.ghostPlan}
        </p>
      ) : null}

      {current ? (
        <div className="space-y-2 rounded-md border-2 border-dashed border-warning/70 bg-warning/10 p-3">
          <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>
              In <span className="font-medium text-foreground">{chapterName(current.chapterId)}</span>
            </span>
            <span className="tabular-nums">
              {corrections.length - pending.length + 1} of {corrections.length}
            </span>
          </p>
          <p className="rounded bg-destructive/10 px-2 py-1 line-through decoration-destructive/50">{current.original}</p>
          <p className="rounded bg-success/10 px-2 py-1">
            {typed.shown}
            {typed.done ? null : <span className="animate-pulse">▌</span>}
          </p>
          {current.comment && typed.done ? <p className="text-xs text-muted-foreground">{current.comment}</p> : null}
          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
          <div className="flex gap-1.5">
            <Button size="sm" disabled={!typed.done || working} onClick={() => void accept(current)}>
              <Check /> Accept
            </Button>
            <Button size="sm" variant="outline" disabled={working} onClick={() => void reject(current)}>
              <X /> Reject
            </Button>
          </div>
        </div>
      ) : corrections.length > 0 ? (
        <div className="space-y-2">
          <p className="text-success">
            {corrections.length === 1 ? "The correction is" : `All ${corrections.length} corrections are`} settled, so the flag is marked Accepted.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate("edit")}>
            Back to the flags
          </Button>
        </div>
      ) : run && !run.busy && run.ok === false ? null : !run ? (
        <p className="text-muted-foreground">No corrections are waiting for this flag.</p>
      ) : null}
    </div>
  );
}
