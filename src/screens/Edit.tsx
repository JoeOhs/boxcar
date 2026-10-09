import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, History, MessageSquare, Sparkles, Trash2, X } from "lucide-react";
import { db, newId, type AgentRole, type Chapter, type Manuscript, type Suggestion } from "@/db/schema";
import { AGENT_LABEL, requestEdits, useAiSettings } from "@/lib/ai";
import { chapterLabel, numberChapters } from "@/lib/chapters";
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
type ReviewRole = "editor" | "proofreader";

function SuggestionsPanel({ chapter, selectedText }: { chapter: Chapter; selectedText: string }) {
  const ai = useAiSettings();
  const online = useOnline();
  const { navigate } = useApp();
  const [original, setOriginal] = useState("");
  const [replacement, setReplacement] = useState("");
  const [comment, setComment] = useState("");
  const [reviewRole, setReviewRole] = useState<ReviewRole>("editor");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const suggestions = useLiveQuery(async () => {
    const rows = await db.suggestions.where("chapterId").equals(chapter.id).toArray();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  }, [chapter.id]);

  const pending = (suggestions ?? []).filter((s) => s.status === "pending");
  const resolved = (suggestions ?? []).filter((s) => s.status !== "pending");

  async function addOwn() {
    if (!original.trim() || original === replacement) return;
    const suggestion: Suggestion = {
      id: newId(),
      chapterId: chapter.id,
      manuscriptId: chapter.manuscriptId,
      source: "user",
      original,
      replacement,
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
    if (!ai) return;
    setBusy(true);
    setMessage(null);
    try {
      const edits = await requestEdits(ai, reviewRole, htmlToText(chapter.content));
      const now = Date.now();
      await db.suggestions.bulkAdd(
        edits.map((edit, i) => ({
          id: newId(),
          chapterId: chapter.id,
          manuscriptId: chapter.manuscriptId,
          source: "ai" as const,
          role: reviewRole as AgentRole,
          original: edit.original,
          replacement: edit.replacement,
          comment: edit.comment,
          status: "pending" as const,
          createdAt: now + i,
        })),
      );
      setMessage({
        ok: true,
        text: edits.length
          ? `The ${AGENT_LABEL[reviewRole].toLowerCase()} proposed ${edits.length} change${edits.length === 1 ? "" : "s"}.`
          : `The ${AGENT_LABEL[reviewRole].toLowerCase()} found nothing to change.`,
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
        <h3 className="text-sm font-medium">Suggest a change</h3>
        <p className="text-xs text-muted-foreground">Select text in the chapter, then use it as the passage to change.</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label htmlFor="s-original">Passage</Label>
            <Button size="sm" variant="ghost" disabled={!selectedText} onClick={() => setOriginal(selectedText)}>
              Use selected text
            </Button>
          </div>
          <Textarea id="s-original" rows={2} value={original} onChange={(e) => setOriginal(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-replacement">Replace with</Label>
          <Textarea id="s-replacement" rows={2} value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-comment">Why (optional)</Label>
          <Input id="s-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        <Button size="sm" disabled={!original.trim() || original === replacement} onClick={() => void addOwn()}>
          Add suggestion
        </Button>
      </Card>

      <Card className="space-y-2 p-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-muted-foreground" /> Ask the AI to review this chapter
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
          <div className="flex items-center gap-2">
            <Select className="h-8 w-36" value={reviewRole} onChange={(e) => setReviewRole(e.target.value as ReviewRole)} aria-label="Who reviews">
              <option value="editor">Editor</option>
              <option value="proofreader">Proofreader</option>
            </Select>
            <Button size="sm" disabled={!ai || busy || !online || !htmlToText(chapter.content)} onClick={() => void review()}>
              {busy ? "Reading..." : "Review"}
            </Button>
          </div>
        )}
        {!online ? <p className="text-xs text-muted-foreground">Offline: reviews need a connection.</p> : null}
        <p className="text-xs text-muted-foreground">Nothing changes in your text until you accept a suggestion.</p>
      </Card>

      {message ? <p className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>{message.text}</p> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Waiting for you ({pending.length})</h3>
        {pending.length === 0 ? <p className="text-xs text-muted-foreground">No suggestions to review.</p> : null}
        {pending.map((s) => (
          <Card key={s.id} className="space-y-2 p-3 text-sm">
            <Badge variant={s.source === "ai" ? "default" : "secondary"}>
              {s.source === "ai" && s.role ? AGENT_LABEL[s.role] : "You"}
            </Badge>
            <p className="rounded bg-destructive/10 px-2 py-1 line-through decoration-destructive/50">{s.original}</p>
            <p className="rounded bg-success/10 px-2 py-1">{s.replacement || <em className="text-muted-foreground">(remove)</em>}</p>
            {s.comment ? <p className="text-xs text-muted-foreground">{s.comment}</p> : null}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void accept(s)}>
                <Check /> Accept
              </Button>
              <Button size="sm" variant="outline" onClick={() => void db.suggestions.update(s.id, { status: "rejected" })}>
                <X /> Reject
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
              <Badge variant={s.status === "accepted" ? "success" : "outline"}>{s.status === "accepted" ? "Accepted" : "Rejected"}</Badge>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.replacement || s.original}</span>
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

function ChapterReview({ chapter, manuscript }: { chapter: Chapter; manuscript: Manuscript }) {
  const [tab, setTab] = useState<Tab>("suggestions");
  const [selectedText, setSelectedText] = useState("");
  const [chatRole, setChatRole] = useState<ReviewRole>("editor");
  const viewRef = useRef<HTMLDivElement>(null);

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
          {chapter.content.trim() ? (
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
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pt-3">
              <Select value={chatRole} onChange={(e) => setChatRole(e.target.value as ReviewRole)} aria-label="Who to ask">
                <option value="editor">Editor</option>
                <option value="proofreader">Proofreader</option>
              </Select>
            </div>
            <div className="min-h-0 flex-1">
              <AgentChat
                key={chatRole}
                manuscriptId={manuscript.id}
                role={chatRole}
                getContext={() =>
                  `Title: ${manuscript.title}\n\nThe chapter being edited, "${chapter.title}":\n${htmlToText(chapter.content).slice(0, 12000)}`
                }
                quickPrompts={[
                  { label: "Feedback on pacing", prompt: "Give me feedback on the pacing of this chapter." },
                  { label: "Check consistency", prompt: "Point out any inconsistencies in this chapter." },
                ]}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === "suggestions" ? <SuggestionsPanel chapter={chapter} selectedText={selectedText} /> : <RevisionsPanel chapter={chapter} />}
          </div>
        )}
      </aside>
    </div>
  );
}

function EditBody({ manuscript }: { manuscript: Manuscript }) {
  const { chapterId, setChapterId, navigate } = useApp();
  const chapters = useChapters(manuscript.id);
  const current = chapters?.find((c) => c.id === chapterId) ?? chapters?.[0];
  const numbers = numberChapters(chapters ?? []);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Edit"
        description="Review the text, accept or reject suggestions, and keep earlier versions."
        actions={
          current ? (
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
          ) : undefined
        }
      />
      {chapters === undefined ? null : current ? (
        <ChapterReview key={current.id} chapter={current} manuscript={manuscript} />
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
