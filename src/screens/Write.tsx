import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { deleteChapter, type Chapter, type ChapterKind, type ChapterStatus, type Manuscript } from "@/db/schema";
import { CHAPTER_KIND_LABEL, numberChapters } from "@/lib/chapters";
import { useChapters } from "@/lib/hooks";
import { createChapter, moveChapter, saveChapter } from "@/lib/store";
import { countWords } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { NoManuscript } from "@/components/NoManuscript";
import { RichEditor } from "@/components/RichEditor";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const KINDS: ChapterKind[] = ["front", "chapter", "back"];

/** Edits one chapter and saves it shortly after each change. */
function ChapterEditor({ chapter }: { chapter: Chapter }) {
  const [title, setTitle] = useState(chapter.title);
  const [words, setWords] = useState(chapter.wordCount);
  const [saved, setSaved] = useState(true);
  const pending = useRef({ title: chapter.title, html: chapter.content });
  const timer = useRef<number | undefined>(undefined);

  function flush() {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    return saveChapter(chapter.id, { title: pending.current.title, content: pending.current.html }).then(() => setSaved(true));
  }

  function schedule() {
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 600);
  }

  useEffect(() => {
    const onLeave = () => {
      if (timer.current !== undefined) void flush();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      // Leaving the chapter (or the screen) must never lose the last keystrokes.
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        void saveChapter(chapter.id, { title: pending.current.title, content: pending.current.html });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-2">
        <Input
          value={title}
          hint="Chapter title"
          className="h-9 border-0 bg-transparent px-0 font-serif text-lg font-semibold shadow-none focus-visible:ring-0"
          onChange={(e) => {
            setTitle(e.target.value);
            pending.current.title = e.target.value;
            schedule();
          }}
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {words.toLocaleString()} words · {saved ? "Saved" : "Saving..."}
        </span>
        <Select
          className="h-8 w-28 shrink-0"
          value={chapter.status}
          onChange={(e) => void saveChapter(chapter.id, { status: e.target.value as ChapterStatus })}
          aria-label="Chapter status"
        >
          <option value="draft">Draft</option>
          <option value="revised">Revised</option>
          <option value="final">Final</option>
        </Select>
      </div>
      <div className="min-h-0 flex-1">
        <RichEditor
          initialHtml={chapter.content}
          onChange={(html) => {
            pending.current.html = html;
            setWords(countWords(html));
            schedule();
          }}
        />
      </div>
    </div>
  );
}

function WriteBody({ manuscript }: { manuscript: Manuscript }) {
  const { chapterId, setChapterId } = useApp();
  const chapters = useChapters(manuscript.id);
  const current = chapters?.find((c) => c.id === chapterId) ?? chapters?.[0];
  const numbers = numberChapters(chapters ?? []);
  const total = (chapters ?? []).reduce((sum, c) => sum + c.wordCount, 0);

  async function add(kind: ChapterKind) {
    const defaultTitle =
      kind === "chapter" ? "" : kind === "front" ? "Dedication" : "About the Author";
    const created = await createChapter(manuscript.id, kind, defaultTitle);
    setChapterId(created.id);
  }

  async function remove(chapter: Chapter) {
    if (!window.confirm(`Delete "${chapter.title || "Untitled"}"? Its text and saved revisions will be lost.`)) return;
    await deleteChapter(chapter.id);
    setChapterId(null);
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Write"
        description={`${manuscript.title}: ${total.toLocaleString()} words${manuscript.targetWordCount ? ` of ${manuscript.targetWordCount.toLocaleString()}` : ""}`}
        actions={
          current ? (
            <>
              <Button size="icon" variant="ghost" title="Move earlier" onClick={() => void moveChapter(current.id, "up")}>
                <ArrowUp />
              </Button>
              <Button size="icon" variant="ghost" title="Move later" onClick={() => void moveChapter(current.id, "down")}>
                <ArrowDown />
              </Button>
              <Button size="icon" variant="ghost" title="Delete" onClick={() => void remove(current)}>
                <Trash2 />
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 space-y-4 overflow-y-auto border-r border-border p-3">
          {KINDS.map((kind) => {
            const group = (chapters ?? []).filter((c) => c.kind === kind);
            return (
              <div key={kind}>
                <div className="mb-1 flex items-center justify-between px-2">
                  <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {CHAPTER_KIND_LABEL[kind]}
                  </h2>
                  <Button size="icon" variant="ghost" className="size-6" title={`Add to ${CHAPTER_KIND_LABEL[kind].toLowerCase()}`} onClick={() => void add(kind)}>
                    <Plus />
                  </Button>
                </div>
                {group.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChapterId(c.id)}
                    className={cn(
                      "flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      c.id === current?.id ? "bg-accent font-medium" : "hover:bg-accent/50",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {numbers.has(c.id) ? `${numbers.get(c.id)}. ` : ""}
                      {c.title || "Untitled"}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{c.wordCount.toLocaleString()}</span>
                  </button>
                ))}
                {group.length === 0 ? <p className="px-2 text-xs text-muted-foreground">None yet</p> : null}
              </div>
            );
          })}
        </aside>
        <section className="min-w-0 flex-1">
          {chapters === undefined ? null : current ? (
            <ChapterEditor key={current.id} chapter={current} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <h2 className="font-serif text-xl font-semibold">Nothing written yet</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add your first chapter, or open an item in the Outline and choose Start writing this.
              </p>
              <Button onClick={() => void add("chapter")}>
                <Plus /> Add first chapter
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function Write() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <WriteBody key={manuscript.id} manuscript={manuscript} />;
}
