import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronLeft, ChevronRight, FileDown, FileText, History, Lock, MessageSquare, PenLine, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import {
  db,
  newId,
  type Chapter,
  type EditStage,
  type Manuscript,
  type Suggestion,
} from "@/db/schema";
import { aiReachable, AGENT_LABEL, copyEditorPersona, requestStageReview, useAiSettings } from "@/lib/ai";
import { chapterLabel, numberChapters } from "@/lib/chapters";
import {
  completeStage,
  EDIT_STAGES,
  isStageOpen,
  modelForStage,
  reopenStage,
  selectStage,
  setStyleGuide,
  settingsForStage,
  stageInfo,
  useEditModels,
  workflowOf,
} from "@/lib/editing";
import { buildDraftDocx } from "@/lib/docx";
import { downloadBlob, fileSafeName } from "@/lib/download";
import { DEVELOPMENTAL_AGENTS, runDevelopmentalReview, summarisedBigPicture, type DevelopmentalProgress } from "@/lib/developmentalReview";
import { exportStageReport, REPORT_TITLE } from "@/lib/reports";
import { genreById, genreContext } from "@/lib/genres";
import { useChapters, useOnline } from "@/lib/hooks";
import { styleGuideAgent, STYLE_GUIDE_AGENTS } from "@/lib/styleGuides";
import { saveChapter, snapshotChapter } from "@/lib/store";
import { diffParagraphs, htmlToText, replaceInHtml, textToParagraphs } from "@/lib/text";
import { cn, formatDate } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { AgentChat } from "@/components/AgentChat";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Tab = "reports" | "revisions" | "ai";

const QUICK_PROMPTS: Record<EditStage, { label: string; prompt: string }[]> = {
  developmental: [
    { label: "Feedback on pacing", prompt: "Give me feedback on the pacing and structure of this chapter." },
    { label: "Character consistency", prompt: "Are the characters consistent in this chapter, and with the rest of the book?" },
  ],
  line: [
    { label: "Tighten the opening", prompt: "Suggest how to tighten and sharpen the opening paragraphs of this chapter." },
    { label: "Check my voice", prompt: "Where does the voice or style wobble in this chapter?" },
  ],
  copy: [{ label: "Check consistency", prompt: "Point out any inconsistencies in spelling, names, numbers or style in this chapter." }],
  proofread: [{ label: "Final check", prompt: "Do a last read for typos, repeated words and formatting slips, and list what you find." }],
};

/** "1 flag", "6 flags". */
const flagCount = (n: number) => `${n} ${n === 1 ? "flag" : "flags"}`;

/** A flag about the book as a whole rather than one chapter; the editors start its text with "Whole book:". */
const isWholeBook = (s: Suggestion) => s.comment.startsWith("Whole book:");
const flagText = (s: Suggestion) => s.comment.replace(/^Whole book:\s*/, "");

/** Every developmental flag of the book, oldest first: the editors' and the author's own. */
function useDevelopmentalFlags(manuscriptId: string): Suggestion[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.suggestions.where("manuscriptId").equals(manuscriptId).toArray();
    return rows.filter((s) => s.stage === "developmental").sort((a, b) => a.createdAt - b.createdAt);
  }, [manuscriptId]);
}

// ---------------------------------------------------------------------------
// The editing workflow: developmental, line, copy, proofreading
// ---------------------------------------------------------------------------

/** Which model this pass runs on. It is chosen in Settings, under Editing team. */
function StageModelNote({ stage, onChange }: { stage: EditStage; onChange: () => void }) {
  const ai = useAiSettings();
  const models = useEditModels();
  if (!ai || !models) return null;
  return (
    <div className="ml-auto space-y-1 text-right">
      <p className="text-xs font-medium">Model for this pass</p>
      <p className="flex h-8 items-center justify-end gap-2 text-sm">
        <code className="text-xs">{modelForStage(ai.provider, models, stage, ai.model)}</code>
        <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={onChange}>
          Change in Settings
        </button>
      </p>
    </div>
  );
}

/** The copy-editing style agent: a dropdown of the pre-programmed style guides. */
function StyleGuideField({ manuscript }: { manuscript: Manuscript }) {
  const current = styleGuideAgent(workflowOf(manuscript).styleGuide).id;
  return (
    <div className="space-y-1">
      <Label htmlFor="style-guide">Style guide</Label>
      <Select id="style-guide" className="h-8 w-64" value={current} onChange={(e) => void setStyleGuide(manuscript, e.target.value)}>
        {STYLE_GUIDE_AGENTS.map((s) => (
          <option key={s.id || "house"} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function WorkflowBar({ manuscript }: { manuscript: Manuscript }) {
  const { navigate } = useApp();
  const ai = useAiSettings();
  const online = useOnline();
  const models = useEditModels();
  const workflow = workflowOf(manuscript);
  const info = stageInfo(workflow.stage);
  const done = workflow.completed.includes(workflow.stage);
  const allDone = workflow.completed.length === EDIT_STAGES.length;
  /** The pass after this one, offered once this one is finished. */
  const next = EDIT_STAGES[EDIT_STAGES.findIndex((s) => s.id === workflow.stage) + 1];
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<DevelopmentalProgress | null>(null);
  const flags = useDevelopmentalFlags(manuscript.id);
  const showFlagProgress = workflow.stage === "developmental" && done && (flags?.length ?? 0) > 0;

  /**
   * Finishing the developmental pass runs the four developmental editors over the whole
   * book. Their flags come back to the author in the developmental report, and only then
   * is the pass finished. It stays selected while the author works through the report;
   * "Move on to line editing" starts the next pass.
   */
  async function finishDevelopmental() {
    if (!ai) {
      setNote({ ok: false, text: "Add your AI key in Settings first. The developmental editors give the feedback that finishes this pass." });
      return;
    }
    if (!aiReachable(ai, online)) {
      setNote({ ok: false, text: "You are offline. The developmental editors need a connection, so the pass is not finished yet." });
      return;
    }
    setBusy(true);
    setNote(null);
    setProgress({ fraction: 0, label: "Opening the manuscript" });
    try {
      const result = await runDevelopmentalReview(manuscript, settingsForStage(ai, models ?? {}, "developmental"), setProgress);
      setProgress(null);
      // The flags pane opens beneath the chapter on its own once the pass is finished.
      await completeStage(manuscript, "developmental", { stay: true });
      setNote({
        ok: true,
        text:
          result.notes > 0
            ? `The developmental editors raised ${flagCount(result.notes)}. Each chapter's flags are in the pane beneath it; move on to line editing when you're ready.`
            : "The developmental editors raised no flags. Move on to line editing when you're ready.",
      });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "The developmental pass could not be run. Nothing was changed." });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function finish() {
    if (workflow.stage === "developmental") {
      await finishDevelopmental();
      return;
    }
    const waiting = await db.suggestions
      .where("manuscriptId")
      .equals(manuscript.id)
      .filter((s) => s.status === "pending" && (s.stage === undefined || s.stage === workflow.stage))
      .count();
    if (waiting > 0) {
      const ok = window.confirm(
        `${waiting} ${waiting === 1 ? "suggestion is" : "suggestions are"} still waiting in the ${info.label.toLowerCase()} pass. Finish it anyway?`,
      );
      if (!ok) return;
    }
    await completeStage(manuscript, workflow.stage);
  }

  return (
    <div className="shrink-0 space-y-3 border-b border-border bg-muted/30 px-6 py-3">
      <ol className="flex flex-wrap items-center gap-2" aria-label="Editing workflow">
        {EDIT_STAGES.map((stage, index) => {
          const open = isStageOpen(workflow, stage.id);
          const finished = workflow.completed.includes(stage.id);
          const active = stage.id === workflow.stage;
          return (
            <li key={stage.id} className="flex items-center gap-2">
              <button
                disabled={!open}
                aria-current={active ? "step" : undefined}
                title={open ? stage.summary : "Finish the passes before this one first"}
                onClick={() => void selectStage(manuscript, stage.id)}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                )}
              >
                <span className="flex size-4 items-center justify-center text-[10px] font-semibold">
                  {finished ? <Check className="size-3.5" /> : open ? index + 1 : <Lock className="size-3" />}
                </span>
                {stage.label}
              </button>
              {index < EDIT_STAGES.length - 1 ? <span className="text-muted-foreground">/</span> : null}
            </li>
          );
        })}
      </ol>
      <p className="max-w-3xl text-xs text-muted-foreground">{info.summary}</p>
      <div className="flex flex-wrap items-end gap-4">
        {workflow.stage === "copy" ? <StyleGuideField key={manuscript.id} manuscript={manuscript} /> : null}
        <div className="flex items-center gap-2">
          {done && next ? (
            <Button
              size="sm"
              onClick={() => {
                setNote(null);
                void selectStage(manuscript, next.id);
              }}
            >
              <ChevronRight /> Move on to {next.label.toLowerCase()}
            </Button>
          ) : null}
          {done ? (
            <Button size="sm" variant="outline" onClick={() => void reopenStage(manuscript, workflow.stage)}>
              <RotateCcw /> Reopen this pass
            </Button>
          ) : workflow.stage === "developmental" ? (
            <Button
              size="sm"
              disabled={busy}
              title="The developmental editors read the whole book and write their report"
              onClick={() => void finish()}
            >
              <Check /> {busy ? "Reading the whole book..." : "Begin Editing"}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void finish()}>
              <Check /> {busy ? "Working..." : `Finish ${info.label.toLowerCase()}`}
            </Button>
          )}
          {allDone ? (
            <Button size="sm" variant="secondary" onClick={() => navigate("format")}>
              All passes done: go to Format
            </Button>
          ) : null}
        </div>
        {/* ml-auto pushes the model note to the right-hand end of the row. */}
        <StageModelNote stage={workflow.stage} onChange={() => navigate("settings")} />
      </div>
      {showFlagProgress && flags ? <FlagsProgress flags={flags} /> : null}
      {progress ? <EditorsProgress progress={progress} /> : null}
      {note ? <p className={cn("text-sm", note.ok ? "text-success" : "text-destructive")}>{note.text}</p> : null}
    </div>
  );
}

/** How many of the developmental flags the author has marked addressed or dismissed. */
function FlagsProgress({ flags }: { flags: Suggestion[] }) {
  const worked = flags.filter((f) => f.status !== "pending").length;
  const percent = Math.round((worked / flags.length) * 100);
  const text = worked === flags.length ? "Every flag worked through" : `${worked} of ${flagCount(flags.length)} worked through`;
  return (
    <div className="max-w-md space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-foreground">{text}</span>
        <span className="tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Developmental flags worked through"
        aria-valuemin={0}
        aria-valuemax={flags.length}
        aria-valuenow={worked}
        aria-valuetext={text}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-success transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The bar shown while the developmental editors work: how far along, and a couple of words on what they are doing. */
function EditorsProgress({ progress }: { progress: DevelopmentalProgress }) {
  const percent = Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100);
  return (
    <div className="max-w-md space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="animate-pulse text-foreground">{progress.label}…</span>
        <span className="tabular-nums text-muted-foreground">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Developmental editors at work"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${progress.label}, ${percent}%`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * The developmental editor's report: a card introducing it, then a Flags card
 * with each flag nested under the editor who raised it. Hovering a flag offers
 * "Push to writing space"; asking about a flag opens the editor chat with the
 * question ready to send.
 */
export function DevelopmentalReport({
  manuscript,
  onOpenChapter,
  onAsk,
  onPush,
  onClose,
}: {
  manuscript: Manuscript;
  onOpenChapter: (chapterId: string) => void;
  onAsk: (note: Suggestion) => void;
  onPush: (note: Suggestion) => void;
  /** Closes the report; the chapter underneath was never left. */
  onClose: () => void;
}) {
  const notes = useLiveQuery(async () => {
    const rows = await db.suggestions.where("manuscriptId").equals(manuscript.id).toArray();
    return rows.filter((s) => s.stage === "developmental" && s.agent).sort((a, b) => a.createdAt - b.createdAt);
  }, [manuscript.id]);
  const chapters = useChapters(manuscript.id);

  const closeButton = (
    <Button size="sm" variant="outline" onClick={onClose}>
      <X /> Close the report
    </Button>
  );

  if (notes === undefined) return null;
  if (notes.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h2 className="font-serif text-xl font-semibold">The developmental report is empty</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Finish the developmental pass and the editors' report will be kept here, with each flag to work through.
        </p>
        {closeButton}
      </div>
    );
  }

  const titleOf = (chapterId: string) => {
    const chapter = chapters?.find((item) => item.id === chapterId);
    return chapter ? chapter.title || "Untitled chapter" : "Chapter";
  };
  const clean = (note: Suggestion) => note.comment.replace(/^Whole book:\s*/, "");
  const groups = DEVELOPMENTAL_AGENTS.map((agent) => ({
    agent,
    items: notes.filter((note) => note.agent === agent.name),
  })).filter((group) => group.items.length > 0);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="space-y-1 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-semibold">Developmental report</h2>
            {closeButton}
          </div>
          <p className="text-sm text-muted-foreground">
            Every flag the editors raised, for the whole book. Each chapter's flags are also in the pane beneath it, where
            you mark them addressed or dismissed.
          </p>
        </div>
        <section className="space-y-5 rounded-lg border border-border bg-card p-4" aria-label="Flags in the report">
          <h2 className="text-sm font-medium">Flags ({notes.length})</h2>
          {groups.map(({ agent, items }) => (
            <div key={agent.id} className="space-y-2">
              <h3 className="text-sm font-medium">
                {agent.name} <span className="font-normal text-muted-foreground">· {flagCount(items.length)}</span>
              </h3>
              {/* Each flag sits indented under the editor (the subject) who raised it. */}
              <div className="ml-2 space-y-2 border-l-2 border-border pl-4">
                {items.map((note) => (
                  <article key={note.id} className="group space-y-2 rounded-md border border-border bg-background p-3 text-sm">
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      {note.comment.startsWith("Whole book:") ? "Whole book" : titleOf(note.chapterId)}
                      {note.status === "pending" ? null : (
                        <Badge variant={note.status === "accepted" ? "success" : "outline"}>
                          {note.status === "accepted" ? "Addressed" : "Dismissed"}
                        </Badge>
                      )}
                    </p>
                    <p>{clean(note)}</p>
                    <div className="flex flex-wrap gap-1.5 opacity-70 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button size="sm" onClick={() => onPush(note)}>
                        <PenLine /> Push to writing space
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onAsk(note)}>
                        <MessageSquare /> Ask the Editor
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onOpenChapter(note.chapterId)}>
                        Open the chapter
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Suggestions, revisions and the chat for the open chapter
// ---------------------------------------------------------------------------

function SuggestionsPanel({
  chapter,
  manuscript,
  stage,
  selectedText,
  flagsInPane = false,
}: {
  chapter: Chapter;
  manuscript: Manuscript;
  stage: EditStage;
  selectedText: string;
  /** The developmental flags are worked through in the pane beneath the chapter, so they are not listed here too. */
  flagsInPane?: boolean;
}) {
  const ai = useAiSettings();
  const models = useEditModels();
  const online = useOnline();
  const { navigate } = useApp();
  const info = stageInfo(stage);
  const notes = info.output === "notes";
  const [original, setOriginal] = useState("");
  const [replacement, setReplacement] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const suggestions = useLiveQuery(async () => {
    const rows = await db.suggestions.where("chapterId").equals(chapter.id).toArray();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }, [chapter.id]);

  // Suggestions made before the workflow existed carry no pass and show in every pass.
  const inStage = (suggestions ?? []).filter((s) => s.stage === undefined || s.stage === stage);
  const pending = inStage.filter((s) => s.status === "pending");
  const resolved = inStage.filter((s) => s.status !== "pending");

  const canAdd = notes ? Boolean(comment.trim()) : Boolean(original.trim()) && original !== replacement;

  async function addOwn() {
    if (!canAdd) return;
    const suggestion: Suggestion = {
      id: newId(),
      chapterId: chapter.id,
      manuscriptId: chapter.manuscriptId,
      source: "user",
      stage,
      kind: notes ? "note" : "change",
      original,
      replacement: notes ? "" : replacement,
      comment: comment.trim(),
      status: "pending",
      createdAt: Date.now(),
    };
    await db.suggestions.add(suggestion);
    setOriginal("");
    setReplacement("");
    setComment("");
    setMessage(null);
  }

  async function accept(s: Suggestion) {
    if (s.kind === "note") {
      await db.suggestions.update(s.id, { status: "accepted" });
      return;
    }
    // Read, snapshot, save and mark accepted in one transaction: all of it happens or none of it.
    const outcome = await db.transaction("rw", db.chapters, db.revisions, db.suggestions, async () => {
      const fresh = await db.chapters.get(s.chapterId);
      if (!fresh) return "missing" as const;
      const result = replaceInHtml(fresh.content, s.original, s.replacement);
      if (!result.ok) return result.reason;
      await snapshotChapter(fresh, "Before accepting a suggestion");
      await saveChapter(fresh.id, { content: result.html });
      await db.suggestions.update(s.id, { status: "accepted" });
      return "applied" as const;
    });
    if (outcome === "missing") {
      setMessage({ ok: false, text: "That passage is no longer in the chapter, so the change could not be applied." });
    } else if (outcome === "ambiguous") {
      setMessage({ ok: false, text: "That passage appears more than once in the chapter, so it was not changed. Make the edit by hand, or reject it." });
    } else {
      setMessage({ ok: true, text: "Applied. The earlier text is kept under Revisions." });
    }
  }

  async function review() {
    if (!ai || !models) return;
    setBusy(true);
    setMessage(null);
    try {
      const context = notes
        ? await summarisedBigPicture(manuscript, settingsForStage(ai, models, "developmental"), (text) => setMessage({ ok: true, text }))
        : "";
      const style = styleGuideAgent(workflowOf(manuscript).styleGuide);
      const edits = await requestStageReview(
        settingsForStage(ai, models, stage),
        stage,
        htmlToText(chapter.content),
        context,
        style.rules,
        stage === "copy" ? copyEditorPersona(style) : undefined,
      );
      const now = Date.now();
      await db.suggestions.bulkAdd(
        edits.map((edit, i) => ({
          id: newId(),
          chapterId: chapter.id,
          manuscriptId: chapter.manuscriptId,
          source: "ai" as const,
          role: info.role,
          stage,
          kind: edit.kind,
          original: edit.original,
          replacement: edit.replacement,
          comment: edit.comment,
          status: "pending" as const,
          createdAt: now + i,
        })),
      );
      const who = AGENT_LABEL[info.role].toLowerCase();
      const what = notes ? "flag" : "change";
      setMessage({
        ok: true,
        text: edits.length
          ? `The ${who} proposed ${edits.length} ${what}${edits.length === 1 ? "" : "s"}.`
          : `The ${who} found nothing to raise in the ${info.label.toLowerCase()} pass.`,
      });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "The review failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-3">
        <h3 className="text-sm font-medium">{notes ? "Add a flag" : "Suggest a change"}</h3>
        <p className="text-xs text-muted-foreground">
          {notes
            ? "Write down a structural concern. Select text in the chapter to point at a passage, or leave the passage empty for the whole chapter."
            : "Select text in the chapter, then use it as the passage to change."}
        </p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="s-original">{notes ? "Passage (optional)" : "Passage"}</Label>
            <Button size="sm" variant="ghost" disabled={!selectedText} onClick={() => setOriginal(selectedText)}>
              Use selected text
            </Button>
          </div>
          <Textarea id="s-original" rows={2} value={original} onChange={(e) => setOriginal(e.target.value)} />
        </div>
        {notes ? null : (
          <div className="space-y-1">
            <Label htmlFor="s-replacement">Replace with</Label>
            <Textarea id="s-replacement" rows={2} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="s-comment">{notes ? "Your flag" : "Why (optional)"}</Label>
          {notes ? (
            <Textarea id="s-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          ) : (
            <Input id="s-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          )}
        </div>
        <Button size="sm" disabled={!canAdd} onClick={() => void addOwn()}>
          {notes ? "Add flag" : "Add suggestion"}
        </Button>
      </Card>

      <Card className="space-y-2 p-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-muted-foreground" /> Ask the AI for a {info.label.toLowerCase()} pass on this chapter
        </h3>
        {ai === null ? (
          <p className="text-xs text-muted-foreground">
            This uses your own AI key.{" "}
            <button className="underline" onClick={() => navigate("settings")}>
              Add it in Settings
            </button>
            .
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={!ai || !models || busy || !aiReachable(ai, online) || !htmlToText(chapter.content)} onClick={() => void review()}>
              {busy ? "Reading..." : `Review as ${AGENT_LABEL[info.role].toLowerCase()}`}
            </Button>
            {ai && models ? <span className="text-xs text-muted-foreground">Model: {modelForStage(ai.provider, models, stage, ai.model)}</span> : null}
          </div>
        )}
        {!aiReachable(ai, online) ? <p className="text-xs text-muted-foreground">Offline: reviews need a connection.</p> : null}
        <p className="text-xs text-muted-foreground">Nothing changes in your text until you accept a suggestion.</p>
      </Card>

      {message ? <p className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>{message.text}</p> : null}

      {flagsInPane ? (
        <p className="text-xs text-muted-foreground">Flags you add, and any the AI raises here, appear in the pane beneath the chapter.</p>
      ) : (
      <>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Waiting for you ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">{notes ? "No flags to go through." : "No suggestions to review."}</p>
        ) : null}
        {pending.map((s) => (
          <Card key={s.id} className="space-y-2 p-3 text-sm">
            <Badge variant={s.source === "ai" ? "default" : "secondary"}>
              {s.source === "ai" && s.role ? (AGENT_LABEL[s.role] ?? "Editor") : "You"}
            </Badge>
            {s.kind === "note" ? (
              <>
                {s.original ? <p className="rounded bg-muted px-2 py-1 italic">{s.original}</p> : null}
                <p>{s.comment}</p>
              </>
            ) : (
              <>
                <p className="rounded bg-destructive/10 px-2 py-1 line-through decoration-destructive/50">{s.original}</p>
                <p className="rounded bg-success/10 px-2 py-1">{s.replacement || <em className="text-muted-foreground">(remove)</em>}</p>
                {s.comment ? <p className="text-xs text-muted-foreground">{s.comment}</p> : null}
              </>
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void accept(s)}>
                <Check /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => void db.suggestions.update(s.id, { status: "rejected" })}>
                <X /> {s.kind === "note" ? "Dismiss" : "Reject"}
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {resolved.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Done</h3>
          {resolved.map((s) => (
            <div key={s.id} className="flex items-start gap-2 rounded-md border border-border p-2 text-xs">
              <Badge variant={s.status === "accepted" ? "success" : "outline"}>
                {s.kind === "note"
                  ? s.status === "accepted"
                    ? "Addressed"
                    : "Dismissed"
                  : s.status === "accepted"
                    ? "Accepted"
                    : "Rejected"}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {s.kind === "note" ? s.comment : s.replacement || s.original}
              </span>
              <button title="Remove from the list" className="text-muted-foreground hover:text-foreground" onClick={() => void db.suggestions.delete(s.id)}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      </>
      )}
    </div>
  );
}

/**
 * The flags pane beneath the chapter, open once the developmental pass is finished. It
 * follows the page: this chapter's flags, with the whole-book flags pinned above them.
 * Marking a flag addressed or dismissed moves the bar under the workflow buttons.
 */
function FlagsPane({
  chapter,
  label,
  onAsk,
  onPush,
}: {
  chapter: Chapter;
  /** The chapter's name as the page shows it, e.g. "Chapter 3: The Crossing". */
  label: string;
  onAsk: (flag: Suggestion) => void;
  onPush: (flag: Suggestion) => void;
}) {
  const flags = useDevelopmentalFlags(chapter.manuscriptId);
  const [collapsed, setCollapsed] = useState(false);
  if (!flags || flags.length === 0) return null;
  const wholeBook = flags.filter(isWholeBook);
  const here = flags.filter((f) => !isWholeBook(f) && f.chapterId === chapter.id);
  const open = [...wholeBook, ...here].filter((f) => f.status === "pending").length;
  const setStatus = (f: Suggestion, status: Suggestion["status"]) => void db.suggestions.update(f.id, { status });

  function card(f: Suggestion) {
    const pending = f.status === "pending";
    return (
      <article key={f.id} className={cn("space-y-1.5 rounded-md border border-border p-2.5 text-sm", !pending && "opacity-60")}>
        <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          {f.agent ?? (f.source === "user" ? "Your flag" : "Developmental editor")}
          {pending ? null : (
            <Badge variant={f.status === "accepted" ? "success" : "outline"}>{f.status === "accepted" ? "Addressed" : "Dismissed"}</Badge>
          )}
        </p>
        {f.original ? <p className="rounded bg-muted px-2 py-1 text-xs italic">{f.original}</p> : null}
        <p>{flagText(f)}</p>
        <div className="flex flex-wrap gap-1.5">
          {pending ? (
            <>
              <Button size="sm" className="h-7 px-2" onClick={() => setStatus(f, "accepted")}>
                <Check /> Accept
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setStatus(f, "rejected")}>
                <X /> Dismiss
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onPush(f)}>
                <PenLine /> Push to writing space
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => onAsk(f)}>
                <MessageSquare /> Ask the Editor
              </Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setStatus(f, "pending")}>
              <RotateCcw /> Undo
            </Button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section
      aria-label="Developmental flags for this chapter"
      className={cn("flex shrink-0 flex-col border-t border-border bg-muted/20", collapsed ? "" : "max-h-[45%]")}
    >
      <button
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-2 text-left text-sm font-medium hover:bg-accent/50"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>
          Flags · {label}{" "}
          <span className="font-normal text-muted-foreground">
            ({open === 0 ? "all worked through" : `${open} open`})
          </span>
        </span>
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", collapsed ? "" : "rotate-90")} />
      </button>
      {collapsed ? null : (
        <div className="min-h-0 space-y-3 overflow-y-auto px-4 pb-4">
          {wholeBook.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Whole book</h4>
              {wholeBook.map(card)}
            </div>
          ) : null}
          <div className="space-y-2">
            {wholeBook.length > 0 ? <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This chapter</h4> : null}
            {here.length > 0 ? here.map(card) : <p className="text-xs text-muted-foreground">No flags on this chapter.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function RevisionsPanel({ chapter }: { chapter: Chapter }) {
  const [label, setLabel] = useState("");
  const [compareId, setCompareId] = useState<string | null>(null);

  const revisions = useLiveQuery(async () => {
    const rows = await db.revisions.where("chapterId").equals(chapter.id).toArray();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }, [chapter.id]);

  const compared = revisions?.find((r) => r.id === compareId);
  const diff = useMemo(
    () =>
      compared
        ? diffParagraphs(textToParagraphs(htmlToText(compared.content)), textToParagraphs(htmlToText(chapter.content)))
        : [],
    [compared, chapter.content],
  );

  async function restore(id: string) {
    const revision = revisions?.find((r) => r.id === id);
    if (!revision) return;
    if (!window.confirm("Restore this version? The current text is saved as a revision first.")) return;
    await snapshotChapter(chapter, "Before restoring an older version");
    await saveChapter(chapter.id, { title: revision.title, content: revision.content });
    setCompareId(null);
  }

  return (
    <div className="space-y-5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void snapshotChapter(chapter, label.trim() || "Manual snapshot");
          setLabel("");
        }}
      >
        <Input value={label} onChange={(e) => setLabel(e.target.value)} hint="Name this snapshot (optional)" />
        <Button type="submit" variant="outline">
          Save snapshot
        </Button>
      </form>

      {revisions?.length === 0 ? (
        <p className="text-sm text-muted-foreground">No saved versions. Snapshots are also made before each accepted suggestion.</p>
      ) : null}
      <div className="space-y-2">
        {revisions?.map((r) => (
          <Card key={r.id} className={cn("space-y-2 p-3 text-sm", r.id === compareId && "ring-2 ring-ring/50")}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.wordCount.toLocaleString()} words</span>
            </div>
            <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCompareId(r.id === compareId ? null : r.id)}>
                {r.id === compareId ? "Hide changes" : "Compare"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void restore(r.id)}>
                Restore
              </Button>
              <Button
                size="icon"
                variant="ghost"
                title="Delete this version"
                onClick={() => {
                  if (compareId === r.id) setCompareId(null);
                  void db.revisions.delete(r.id);
                }}
              >
                <Trash2 />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {compared ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">What changed since "{compared.label}"</h3>
          <div className="space-y-1 text-sm">
            {diff.every((line) => line.type === "same") ? <p className="text-muted-foreground">The text is the same.</p> : null}
            {diff.map((line, i) => (
              <p
                key={i}
                className={cn(
                  "rounded px-2 py-1",
                  line.type === "removed" && "bg-destructive/10 line-through decoration-destructive/50",
                  line.type === "added" && "bg-success/10",
                  line.type === "same" && "text-muted-foreground",
                )}
              >
                {line.text}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A finished pass's items on this chapter, read-only, behind the Reports menu's "Open". */
function ReportArchiveList({ chapter, stage }: { chapter: Chapter; stage: EditStage }) {
  const items = useLiveQuery(async () => {
    const rows = await db.suggestions.where("chapterId").equals(chapter.id).toArray();
    return rows.filter((s) => s.source === "ai" && s.stage === stage).sort((a, b) => a.createdAt - b.createdAt);
  }, [chapter.id, stage]);
  if (!items) return null;
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nothing from this pass on this chapter yet.</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((s) => (
        <Card key={s.id} className="space-y-2 p-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant={s.status === "accepted" ? "success" : s.status === "rejected" ? "outline" : "secondary"}>
              {s.kind === "note"
                ? s.status === "accepted"
                  ? "Addressed"
                  : s.status === "rejected"
                    ? "Dismissed"
                    : "Open"
                : s.status === "accepted"
                  ? "Accepted"
                  : s.status === "rejected"
                    ? "Rejected"
                    : "Open"}
            </Badge>
            {s.agent ? <span className="text-xs text-muted-foreground">{s.agent}</span> : null}
          </div>
          {s.kind === "note" ? (
            <>
              {s.original ? <p className="rounded bg-muted px-2 py-1 italic">{s.original}</p> : null}
              <p>{s.comment.replace(/^Whole book:\s*/, "")}</p>
            </>
          ) : (
            <>
              <p className="rounded bg-destructive/10 px-2 py-1 line-through decoration-destructive/50">{s.original}</p>
              <p className="rounded bg-success/10 px-2 py-1">{s.replacement || <em className="text-muted-foreground">(remove)</em>}</p>
              {s.comment ? <p className="text-xs text-muted-foreground">{s.comment}</p> : null}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

/**
 * The Reports menu: one row per editing pass, with what its editor agents have
 * written for the whole book. Opening a report reads it here; exporting saves it
 * to the local drive as a Markdown file.
 */
function ReportsMenu({
  manuscript,
  viewStage,
  onView,
  onOpenDevReport,
}: {
  manuscript: Manuscript;
  viewStage: EditStage;
  onView: (stage: EditStage) => void;
  /** Opens the full developmental report; left out when the report is already open. */
  onOpenDevReport?: () => void;
}) {
  const { workspace } = useApp();
  const [exporting, setExporting] = useState<EditStage | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const counts = useLiveQuery(async () => {
    const rows = await db.suggestions.where("manuscriptId").equals(manuscript.id).toArray();
    const workflow = workflowOf(manuscript);
    const out = {} as Record<EditStage, number>;
    for (const item of EDIT_STAGES) {
      out[item.id] = rows.filter((s) => s.source === "ai" && (s.stage === item.id || (s.stage === undefined && item.id === workflow.stage))).length;
    }
    return out;
  }, [manuscript.id, manuscript.editWorkflow]);

  const [exportingDraft, setExportingDraft] = useState(false);

  /** Writes the whole book as a Word file for a human editor, with the text as it is now. */
  async function exportDraft() {
    setExportingDraft(true);
    setNote(null);
    try {
      const fresh = await db.manuscripts.get(manuscript.id);
      if (!fresh) throw new Error("This manuscript no longer exists.");
      const rows = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
      const blob = await buildDraftDocx(fresh, workspace?.name ?? "", rows);
      const filename = `${fileSafeName(fresh.title)}-editing-draft.docx`;
      downloadBlob(blob, filename);
      setNote({ ok: true, text: `Saved ${filename}. Send it to your editor.` });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "The export failed." });
    } finally {
      setExportingDraft(false);
    }
  }

  async function exportReport(reportStage: EditStage) {
    setExporting(reportStage);
    setNote(null);
    try {
      const filename = await exportStageReport(manuscript, workspace?.name ?? "", reportStage);
      setNote({ ok: true, text: `Saved ${filename} to your downloads.` });
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : "The report could not be exported." });
    } finally {
      setExporting(null);
    }
  }

  return (
    <Card className="space-y-1 p-2">
      <h3 className="px-1 pb-1 text-sm font-medium">Reports</h3>
      <p className="px-1 pb-1 text-xs text-muted-foreground">What the editor agents have written. Open a report to read it, or export it to your drive.</p>
      {EDIT_STAGES.map((item) => {
        const count = counts?.[item.id] ?? 0;
        const active = viewStage === item.id;
        return (
          <div key={item.id} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors", active ? "bg-accent" : "hover:bg-accent/50")}>
            <button className="min-w-0 flex-1 text-left" onClick={() => onView(item.id)} aria-pressed={active}>
              <span className="block truncate font-medium">{REPORT_TITLE[item.id]}</span>
              <span className="block text-xs text-muted-foreground">
                {item.id === "developmental" ? "The developmental editors" : AGENT_LABEL[item.role]}
                {" · "}
                {count === 0 ? "nothing yet" : item.id === "developmental" ? flagCount(count) : `${count} ${count === 1 ? "item" : "items"}`}
              </span>
            </button>
            {item.id === "developmental" && onOpenDevReport ? (
              <Button size="sm" variant="ghost" className="h-7 shrink-0 px-2" disabled={count === 0} title="Open the full developmental report" onClick={onOpenDevReport}>
                Full report
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2"
              disabled={count === 0 || exporting !== null}
              title="Export this report to your local drive"
              onClick={() => void exportReport(item.id)}
            >
              <FileDown /> {exporting === item.id ? "Saving..." : "Export"}
            </Button>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-2 border-t border-border px-2 pt-2">
        <span className="text-xs text-muted-foreground">The whole book as a Word file, for a human editor.</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2"
          disabled={exportingDraft}
          title="Save the whole book as a Word file for a human editor"
          onClick={() => void exportDraft()}
        >
          <FileDown /> {exportingDraft ? "Exporting..." : "Export for editing"}
        </Button>
      </div>
      {note ? <p className={cn("px-1 pt-1 text-xs", note.ok ? "text-success" : "text-destructive")}>{note.text}</p> : null}
    </Card>
  );
}

function ChapterReview({
  chapter,
  manuscript,
  stage,
  initialTab,
  initialQuestion,
  onOpenReport,
  flagsPane,
  onPush,
  chapters,
  numbers,
  onChapterChange,
}: {
  chapter: Chapter;
  /** Every chapter of the book, in order, for turning pages. */
  chapters: Chapter[];
  numbers: ReturnType<typeof numberChapters>;
  onChapterChange: (chapterId: string) => void;
  manuscript: Manuscript;
  stage: EditStage;
  /** The tab to open on, e.g. the chat after a flag is asked about. */
  initialTab?: Tab;
  /** A question from the developmental report, put in the chat box ready to send. */
  initialQuestion?: string;
  /** Opens the full developmental report view. */
  onOpenReport: () => void;
  /** The developmental pass is finished and still selected: its flags are worked through in a pane beneath the page. */
  flagsPane: boolean;
  /** Sends a flag to the writing space. */
  onPush: (flag: Suggestion) => void;
}) {
  const ai = useAiSettings();
  const models = useEditModels();
  const [tab, setTab] = useState<Tab>(initialTab ?? "reports");
  const [viewStage, setViewStage] = useState<EditStage>(stage);
  // A question from the report or the flags pane, put in the chat box ready to send.
  const [question, setQuestion] = useState(initialQuestion);
  const flags = useDevelopmentalFlags(manuscript.id);
  /** Open flags per chapter, shown in the chapter dropdown while the flags pane is in use. */
  const openFlags = new Map<string, number>();
  for (const f of flags ?? []) {
    if (f.status === "pending" && !isWholeBook(f)) openFlags.set(f.chapterId, (openFlags.get(f.chapterId) ?? 0) + 1);
  }
  const [selectedText, setSelectedText] = useState("");
  const viewRef = useRef<HTMLDivElement>(null);
  const info = stageInfo(stage);

  // Follow the workflow when it moves to another pass.
  useEffect(() => setViewStage(stage), [stage]);

  function askAbout(flag: Suggestion) {
    setQuestion(flagText(flag));
    setTab("ai");
  }

  function captureSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (text && selection?.anchorNode && viewRef.current?.contains(selection.anchorNode)) setSelectedText(text);
  }

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "reports", label: "Reports", icon: <FileText /> },
    { id: "revisions", label: "Revisions", icon: <History /> },
    { id: "ai", label: "Ask the AI", icon: <MessageSquare /> },
  ];

  const index = chapters.findIndex((c) => c.id === chapter.id);
  const previous = index > 0 ? chapters[index - 1] : undefined;
  const next = index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined;
  const label = (c: Chapter) => chapterLabel(c, numbers.get(c.id), "numbered-with-title");

  // The parent is a grid: the page sits under the workflow bar, the side panel runs the full height.
  return (
    <div className="contents">
      <section className="col-start-1 row-start-2 flex min-h-0 min-w-0 flex-col">
        <nav className="flex shrink-0 items-center justify-center gap-2 border-b border-border px-4 py-2" aria-label="Turn pages">
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={!previous}
            aria-label="Previous chapter"
            title={previous ? `Previous: ${label(previous)}` : "This is the first chapter"}
            onClick={() => previous && onChapterChange(previous.id)}
          >
            <ChevronLeft />
          </Button>
          <Select className="h-8 w-72" value={chapter.id} onChange={(e) => onChapterChange(e.target.value)} aria-label="Chapter to edit">
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
                {flagsPane && openFlags.get(c.id) ? ` · ${openFlags.get(c.id)} open` : ""}
              </option>
            ))}
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={!next}
            aria-label="Next chapter"
            title={next ? `Next: ${label(next)}` : "This is the last chapter"}
            onClick={() => next && onChapterChange(next.id)}
          >
            <ChevronRight />
          </Button>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          ref={viewRef}
          onMouseUp={captureSelection}
          onKeyUp={captureSelection}
          className="prose-manuscript mx-auto max-w-2xl px-8 py-10"
        >
          <h2 className="mt-0! mb-6 text-center font-serif text-2xl font-semibold">{chapter.title || "Untitled"}</h2>
          {htmlToText(chapter.content) ? (
            <div dangerouslySetInnerHTML={{ __html: chapter.content }} />
          ) : (
            <p className="text-center text-sm text-muted-foreground">This chapter is empty. Write it in the Write screen.</p>
          )}
        </div>
        </div>
        {flagsPane ? <FlagsPane chapter={chapter} label={label(chapter)} onAsk={askAbout} onPush={onPush} /> : null}
      </section>

      <aside className="col-start-2 row-span-2 row-start-1 flex min-h-0 w-[26rem] flex-col border-l border-border">
        <div className="flex shrink-0 gap-1 border-b border-border px-3 py-2">
          {tabs.map((t) => (
            <Button key={t.id} size="sm" variant={tab === t.id ? "secondary" : "ghost"} onClick={() => setTab(t.id)}>
              {t.icon}
              {t.label}
            </Button>
          ))}
        </div>
        {tab === "ai" ? (
          <div className="min-h-0 flex-1">
            <AgentChat
              key={`${stage}:${question ?? ""}`}
              manuscriptId={manuscript.id}
              role={info.role}
              persona={stage === "copy" ? copyEditorPersona(styleGuideAgent(workflowOf(manuscript).styleGuide)) : info.persona}
              model={ai && models ? modelForStage(ai.provider, models, stage, ai.model) : undefined}
              getContext={() =>
                `Title: ${manuscript.title}\n${genreContext(genreById(manuscript.genre))}\nEditing pass: ${info.label}\n\nThe chapter being edited, "${chapter.title}" (every word):\n${htmlToText(chapter.content)}`
              }
              quickPrompts={QUICK_PROMPTS[stage]}
              initialText={question ? `About this developmental flag: "${question}"\n\n` : undefined}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "revisions" ? (
              <RevisionsPanel chapter={chapter} />
            ) : (
              <div className="space-y-5">
                <ReportsMenu manuscript={manuscript} viewStage={viewStage} onView={setViewStage} onOpenDevReport={onOpenReport} />
                {viewStage === stage ? (
                  <SuggestionsPanel chapter={chapter} manuscript={manuscript} stage={stage} selectedText={selectedText} flagsInPane={flagsPane} />
                ) : (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">{REPORT_TITLE[viewStage]}: this chapter</h3>
                    <p className="text-xs text-muted-foreground">
                      Read-only: the workflow is on the {info.label.toLowerCase()} pass. The export above covers the whole book.
                    </p>
                    <ReportArchiveList chapter={chapter} stage={viewStage} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function EditBody({ manuscript }: { manuscript: Manuscript }) {
  const { chapterId, setChapterId, navigate, setPushedNote } = useApp();
  const chapters = useChapters(manuscript.id);
  const current = chapters?.find((c) => c.id === chapterId) ?? chapters?.[0];
  const numbers = numberChapters(chapters ?? []);
  const workflow = workflowOf(manuscript);
  /** The full developmental report, read over the chapter; it opens only from "Full report" in the Reports card. */
  const [showReport, setShowReport] = useState(false);
  const [askNote, setAskNote] = useState<Suggestion | null>(null);
  const [askKey, setAskKey] = useState(0);
  const activeQuestion = askNote && current && askNote.chapterId === current.id ? flagText(askNote) : undefined;
  const flagsPane = workflow.stage === "developmental" && workflow.completed.includes("developmental");

  /** Sends a flag to the writing space, where it waits above the chapter until the author is done with it. */
  function pushToWrite(note: Suggestion) {
    setChapterId(note.chapterId);
    setPushedNote({
      chapterId: note.chapterId,
      text: `${note.agent ? `${note.agent}: ` : ""}${note.comment.replace(/^Whole book:\s*/, "")}`,
    });
    navigate("write");
  }

  /** From the full report: closes it and opens the flag's chapter with the question in the chat. */
  function askAbout(note: Suggestion) {
    setChapterId(note.chapterId);
    setAskNote(note);
    setAskKey((value) => value + 1);
    setShowReport(false);
  }

  function openChapter(id: string) {
    setChapterId(id);
    setAskNote(null);
    setShowReport(false);
  }

  const reviewing = chapters !== undefined && current !== undefined;

  return (
    <div className="relative flex h-full flex-col">
      <ScreenHeader
        title="Edit"
        description="Four passes in order: developmental, line, copy and proofreading. Accept or reject suggestions and keep earlier versions."
      />
      {/*
        A grid, so the workflow bar keeps its place (and its state) whatever is shown below it.
        While a chapter is open, the side panel takes the right column from top to bottom.
      */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)]",
          reviewing ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)]",
        )}
      >
        <div className="col-start-1 row-start-1">
          <WorkflowBar manuscript={manuscript} />
        </div>
        {chapters === undefined ? null : current ? (
          <ChapterReview
            key={`${current.id}:${askKey}`}
            chapter={current}
            chapters={chapters}
            numbers={numbers}
            onChapterChange={openChapter}
            manuscript={manuscript}
            stage={workflow.stage}
            initialTab={activeQuestion ? "ai" : undefined}
            initialQuestion={activeQuestion}
            onOpenReport={() => setShowReport(true)}
            flagsPane={flagsPane}
            onPush={pushToWrite}
          />
        ) : (
          <div className="col-start-1 row-start-2 flex flex-col items-center justify-center gap-3 p-8 text-center">
            <h2 className="font-serif text-xl font-semibold">Nothing to edit yet</h2>
            <p className="max-w-sm text-sm text-muted-foreground">Write a chapter first, then come back to review it.</p>
            <Button onClick={() => navigate("write")}>Go to Write</Button>
          </div>
        )}
      </div>
      {showReport ? (
        // Laid over the Edit screen, so closing it returns to exactly where the author was.
        <div role="dialog" aria-label="Developmental report" className="absolute inset-0 z-30 flex flex-col bg-background">
          <DevelopmentalReport
            manuscript={manuscript}
            onOpenChapter={openChapter}
            onAsk={askAbout}
            onPush={pushToWrite}
            onClose={() => setShowReport(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function Edit() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <EditBody key={manuscript.id} manuscript={manuscript} />;
}
