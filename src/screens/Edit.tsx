import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, FileDown, History, Lock, MessageSquare, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import {
  db,
  newId,
  saveEditModel,
  type AiProvider,
  type Chapter,
  type EditStage,
  type Id,
  type Manuscript,
  type OutlineItem,
  type Suggestion,
} from "@/db/schema";
import { aiReachable, AGENT_LABEL, requestStageReview, useAiSettings } from "@/lib/ai";
import { MODEL_SUGGESTIONS } from "@/lib/providers";
import { chapterLabel, numberChapters, sortChapters } from "@/lib/chapters";
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
import { genreById, genreContext } from "@/lib/genres";
import { useChapters, useOnline } from "@/lib/hooks";
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

type Tab = "suggestions" | "revisions" | "ai";

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

function outlineLines(items: OutlineItem[]): string[] {
  const lines: string[] = [];
  const walk = (parentId: Id | null, depth: number) => {
    items
      .filter((item) => item.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .forEach((item) => {
        lines.push(`${"  ".repeat(depth)}- ${item.kind}: ${item.title || "Untitled"}${item.summary ? ` - ${item.summary}` : ""}`);
        walk(item.id, depth + 1);
      });
  };
  walk(null, 0);
  return lines;
}

/** The whole book in brief (outline and chapter openings), so the developmental pass sees the big picture. */
async function bigPicture(manuscript: Manuscript): Promise<string> {
  const [items, chapters] = await Promise.all([
    db.outlineItems.where("manuscriptId").equals(manuscript.id).toArray(),
    db.chapters.where("manuscriptId").equals(manuscript.id).toArray(),
  ]);
  const sorted = sortChapters(chapters);
  const numbers = numberChapters(sorted);
  const parts = [`Title: ${manuscript.title}`];
  const genre = genreContext(genreById(manuscript.genre));
  if (genre) parts.push(genre);
  if (manuscript.description.trim()) parts.push(`Description: ${manuscript.description.trim()}`);
  const outline = outlineLines(items);
  if (outline.length > 0) parts.push(`Outline:\n${outline.join("\n")}`);
  parts.push(
    `Chapters:\n${sorted
      .map(
        (c) =>
          `- ${chapterLabel(c, numbers.get(c.id), "numbered-with-title")} (${c.wordCount} words): ${htmlToText(c.content)
            .slice(0, 240)
            .replace(/\s+/g, " ")}`,
      )
      .join("\n")}`,
  );
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// The editing workflow: developmental, line, copy, proofreading
// ---------------------------------------------------------------------------

/** The model the author picked for one pass. Different passes can use different models. */
function StageModelField({ stage }: { stage: EditStage }) {
  const ai = useAiSettings();
  const models = useEditModels();
  const provider = ai?.provider ?? "anthropic";
  if (!models) return null;
  return <StageModelInput key={`${provider}-${stage}`} stage={stage} provider={provider} initial={modelForStage(provider, models, stage, ai?.model)} />;
}

function StageModelInput({ stage, provider, initial }: { stage: EditStage; provider: AiProvider; initial: string }) {
  const [value, setValue] = useState(initial);
  const listId = `stage-models-${stage}`;
  return (
    <div className="space-y-1">
      <Label htmlFor="stage-model">Model for this pass</Label>
      <Input
        id="stage-model"
        list={listId}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          void saveEditModel(provider, stage, e.target.value.trim());
        }}
        className="h-8 w-56"
      />
      <datalist id={listId}>
        {MODEL_SUGGESTIONS[provider].map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

function StyleGuideField({ manuscript }: { manuscript: Manuscript }) {
  const [value, setValue] = useState(workflowOf(manuscript).styleGuide);
  return (
    <div className="space-y-1">
      <Label htmlFor="style-guide">Style guide</Label>
      <Input
        id="style-guide"
        value={value}
        hint="e.g. Chicago Manual of Style"
        onChange={(e) => {
          setValue(e.target.value);
          void setStyleGuide(manuscript, e.target.value);
        }}
        className="h-8 w-64"
      />
    </div>
  );
}

function WorkflowBar({ manuscript }: { manuscript: Manuscript }) {
  const { navigate } = useApp();
  const workflow = workflowOf(manuscript);
  const info = stageInfo(workflow.stage);
  const done = workflow.completed.includes(workflow.stage);
  const allDone = workflow.completed.length === EDIT_STAGES.length;

  async function finish() {
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
        <StageModelField stage={workflow.stage} />
        {workflow.stage === "copy" ? <StyleGuideField key={manuscript.id} manuscript={manuscript} /> : null}
        <div className="flex items-center gap-2">
          {done ? (
            <Button size="sm" variant="outline" onClick={() => void reopenStage(manuscript, workflow.stage)}>
              <RotateCcw /> Reopen this pass
            </Button>
          ) : (
            <Button size="sm" onClick={() => void finish()}>
              <Check /> Finish {info.label.toLowerCase()}
            </Button>
          )}
          {allDone ? (
            <Button size="sm" variant="secondary" onClick={() => navigate("format")}>
              All passes done: go to Format
            </Button>
          ) : null}
        </div>
      </div>
    </div>
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
}: {
  chapter: Chapter;
  manuscript: Manuscript;
  stage: EditStage;
  selectedText: string;
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
    const fresh = await db.chapters.get(chapter.id);
    if (!fresh) return;
    const next = replaceInHtml(fresh.content, s.original, s.replacement);
    if (next === null) {
      setMessage({ ok: false, text: "That passage is no longer in the chapter, so the change could not be applied." });
      return;
    }
    await snapshotChapter(fresh, "Before accepting a suggestion");
    await saveChapter(fresh.id, { content: next });
    await db.suggestions.update(s.id, { status: "accepted" });
    setMessage({ ok: true, text: "Applied. The earlier text is kept under Revisions." });
  }

  async function review() {
    if (!ai || !models) return;
    setBusy(true);
    setMessage(null);
    try {
      const context = notes ? await bigPicture(manuscript) : "";
      const edits = await requestStageReview(
        settingsForStage(ai, models, stage),
        stage,
        htmlToText(chapter.content),
        context,
        workflowOf(manuscript).styleGuide,
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
      const what = notes ? "note" : "change";
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
        <h3 className="text-sm font-medium">{notes ? "Add a note" : "Suggest a change"}</h3>
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
          <Label htmlFor="s-comment">{notes ? "Your note" : "Why (optional)"}</Label>
          {notes ? (
            <Textarea id="s-comment" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          ) : (
            <Input id="s-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          )}
        </div>
        <Button size="sm" disabled={!canAdd} onClick={() => void addOwn()}>
          {notes ? "Add note" : "Add suggestion"}
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

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Waiting for you ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="text-xs text-muted-foreground">{notes ? "No notes to go through." : "No suggestions to review."}</p>
        ) : null}
        {pending.map((s) => (
          <Card key={s.id} className="space-y-2 p-3 text-sm">
            <Badge variant={s.source === "ai" ? "default" : "secondary"}>
              {s.source === "ai" && s.role ? AGENT_LABEL[s.role] : "You"}
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
                <Check /> {s.kind === "note" ? "Addressed" : "Accept"}
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
    </div>
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

function ChapterReview({ chapter, manuscript, stage }: { chapter: Chapter; manuscript: Manuscript; stage: EditStage }) {
  const ai = useAiSettings();
  const models = useEditModels();
  const [tab, setTab] = useState<Tab>("suggestions");
  const [selectedText, setSelectedText] = useState("");
  const viewRef = useRef<HTMLDivElement>(null);
  const info = stageInfo(stage);

  function captureSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (text && selection?.anchorNode && viewRef.current?.contains(selection.anchorNode)) setSelectedText(text);
  }

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "suggestions", label: "Suggestions", icon: <Check /> },
    { id: "revisions", label: "Revisions", icon: <History /> },
    { id: "ai", label: "Ask the AI", icon: <MessageSquare /> },
  ];

  return (
    <div className="flex min-h-0 flex-1">
      <section className="min-w-0 flex-1 overflow-y-auto">
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
      </section>

      <aside className="flex w-[26rem] shrink-0 flex-col border-l border-border">
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
              key={stage}
              manuscriptId={manuscript.id}
              role={info.role}
              persona={info.persona}
              model={ai && models ? modelForStage(ai.provider, models, stage, ai.model) : undefined}
              getContext={() =>
                `Title: ${manuscript.title}\n${genreContext(genreById(manuscript.genre))}\nEditing pass: ${info.label}\n\nThe chapter being edited, "${chapter.title}":\n${htmlToText(chapter.content).slice(0, 12000)}`
              }
              quickPrompts={QUICK_PROMPTS[stage]}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "suggestions" ? (
              <SuggestionsPanel chapter={chapter} manuscript={manuscript} stage={stage} selectedText={selectedText} />
            ) : (
              <RevisionsPanel chapter={chapter} />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function EditBody({ manuscript }: { manuscript: Manuscript }) {
  const { chapterId, setChapterId, navigate, workspace } = useApp();
  const chapters = useChapters(manuscript.id);
  const current = chapters?.find((c) => c.id === chapterId) ?? chapters?.[0];
  const numbers = numberChapters(chapters ?? []);
  const workflow = workflowOf(manuscript);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<{ ok: boolean; text: string } | null>(null);

  /** Writes the whole book as a Word file for a human editor, with the text as it is now. */
  async function exportDraft() {
    setExporting(true);
    setExportNote(null);
    try {
      const fresh = await db.manuscripts.get(manuscript.id);
      if (!fresh) throw new Error("This manuscript no longer exists.");
      const rows = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
      const blob = await buildDraftDocx(fresh, workspace?.name ?? "", rows);
      const filename = `${fileSafeName(fresh.title)}-editing-draft.docx`;
      downloadBlob(blob, filename);
      setExportNote({ ok: true, text: `Saved ${filename}. Send it to your editor.` });
    } catch (e) {
      setExportNote({ ok: false, text: e instanceof Error ? e.message : "The export failed." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Edit"
        description="Four passes in order: developmental, line, copy and proofreading. Accept or reject suggestions and keep earlier versions."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={exporting || !chapters?.length} title="Save the whole book as a Word file for a human editor" onClick={() => void exportDraft()}>
              <FileDown /> {exporting ? "Exporting..." : "Export for editing"}
            </Button>
            {current ? (
              <Select
                className="h-8 w-64"
                value={current.id}
                onChange={(e) => setChapterId(e.target.value)}
                aria-label="Chapter to edit"
              >
                {chapters?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {chapterLabel(c, numbers.get(c.id), "numbered-with-title")}
                  </option>
                ))}
              </Select>
            ) : null}
          </>
        }
      />
      {exportNote ? (
        <div className={cn("border-b border-border bg-muted px-6 py-1.5 text-xs", exportNote.ok ? "text-muted-foreground" : "text-destructive")}>
          {exportNote.text}
        </div>
      ) : null}
      <WorkflowBar manuscript={manuscript} />
      {chapters === undefined ? null : current ? (
        <ChapterReview key={current.id} chapter={current} manuscript={manuscript} stage={workflow.stage} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <h2 className="font-serif text-xl font-semibold">Nothing to edit yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">Write a chapter first, then come back to review it.</p>
          <Button onClick={() => navigate("write")}>Go to Write</Button>
        </div>
      )}
    </div>
  );
}

export function Edit() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <EditBody key={manuscript.id} manuscript={manuscript} />;
}
