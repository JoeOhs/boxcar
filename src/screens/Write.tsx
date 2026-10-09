import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { deleteChapter, type Chapter, type ChapterKind, type ChapterStatus, type Id, type Manuscript } from "@/db/schema";
import { CHAPTER_KIND_LABEL, numberChapters } from "@/lib/chapters";
import { useChapters } from "@/lib/hooks";
import {
  moveSegmentNextTo,
  newSegment,
  parseSegments,
  segmentWords,
  serializeSegments,
  type Segment,
} from "@/lib/segments";
import { createChapter, moveChapter, saveChapter } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { EditableHtml, EditorToolbar } from "@/components/RichEditor";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const KINDS: ChapterKind[] = ["front", "chapter", "back"];
const SEGMENT_DRAG_TYPE = "application/x-boxcar-segment";

interface DragState {
  id: Id;
  overId: Id | null;
  after: boolean;
}

/**
 * The state of the chapter being written: its title and its segments. It is
 * the one place that saves the chapter, so typing, adding, removing and
 * dragging segments (in the menu or in the writing block) can never overwrite
 * each other. Changes are written to the database shortly after each edit.
 */
function useChapterDraft(chapter: Chapter) {
  const [initial] = useState(() => parseSegments(chapter.content));
  const [title, setTitle] = useState(chapter.title);
  const [segments, setSegments] = useState<Segment[]>(initial);
  const [selectedId, setSelectedId] = useState<Id>(initial[0].id);
  const [saved, setSaved] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const latest = useRef({ title: chapter.title, segments: initial });
  const timer = useRef<number | undefined>(undefined);
  const chapterId = chapter.id;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const { title: t, segments: s } = latest.current;
    return saveChapter(chapterId, { title: t, content: serializeSegments(s) }).then(() => setSaved(true));
  }, [chapterId]);

  const commit = useCallback(
    (nextSegments: Segment[], nextTitle: string = latest.current.title) => {
      latest.current = { title: nextTitle, segments: nextSegments };
      setSegments(nextSegments);
      setTitle(nextTitle);
      setSaved(false);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  useEffect(() => {
    const onLeave = () => {
      if (timer.current !== undefined) void flush();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      // Leaving the chapter (or the screen) must never lose the last keystrokes.
      if (timer.current !== undefined) void flush();
    };
  }, [flush]);

  const focusSegment = useCallback((id: Id) => {
    window.setTimeout(() => {
      const card = document.getElementById(`segment-${id}`);
      card?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      card?.querySelector<HTMLElement>("[contenteditable]")?.focus();
    }, 0);
  }, []);

  const select = useCallback(
    (id: Id, focus: boolean) => {
      setSelectedId(id);
      if (focus) focusSegment(id);
    },
    [focusSegment],
  );

  const move = useCallback(
    (id: Id, targetId: Id, after: boolean) => {
      const next = moveSegmentNextTo(latest.current.segments, id, targetId, after);
      if (next !== latest.current.segments) commit(next);
    },
    [commit],
  );

  return {
    title,
    segments,
    selectedId,
    saved,
    words: segments.reduce((sum, s) => sum + segmentWords(s), 0),
    drag,
    setTitle: (value: string) => commit(latest.current.segments, value),
    editSegment: (id: Id, html: string) =>
      commit(latest.current.segments.map((s) => (s.id === id ? { ...s, html } : s))),
    renameSegment: (id: Id, value: string) =>
      commit(latest.current.segments.map((s) => (s.id === id ? { ...s, title: value } : s))),
    addSegment: (afterId?: Id) => {
      const created = newSegment();
      const all = latest.current.segments;
      const at = afterId ? all.findIndex((s) => s.id === afterId) + 1 : all.length;
      commit([...all.slice(0, at), created, ...all.slice(at)]);
      select(created.id, true);
    },
    removeSegment: (id: Id) => {
      const all = latest.current.segments;
      const target = all.find((s) => s.id === id);
      if (!target || all.length < 2) return;
      if (segmentWords(target) > 0 && !window.confirm(`Delete "${target.title || "this segment"}" and its text?`)) return;
      const index = all.indexOf(target);
      commit(all.filter((s) => s.id !== id));
      if (selectedId === id) setSelectedId(all[index === 0 ? 1 : index - 1].id);
    },
    select,
    dnd: {
      start: (id: Id) => setDrag({ id, overId: null, after: false }),
      over: (overId: Id, after: boolean) =>
        setDrag((d) => (d && !(d.overId === overId && d.after === after) ? { ...d, overId, after } : d)),
      drop: () => {
        if (drag?.overId) move(drag.id, drag.overId, drag.after);
        setDrag(null);
      },
      end: () => setDrag(null),
    },
  };
}

type ChapterDraft = ReturnType<typeof useChapterDraft>;

/** Drag-and-drop wiring shared by the segment rows in the menu and the segment cards in the writing block. */
function dropTargetProps(draft: ChapterDraft, id: Id) {
  return {
    onDragOver: (e: ReactDragEvent<HTMLElement>) => {
      if (!draft.drag) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const box = e.currentTarget.getBoundingClientRect();
      draft.dnd.over(id, e.clientY > box.top + box.height / 2);
    },
    onDrop: (e: ReactDragEvent<HTMLElement>) => {
      if (!draft.drag) return;
      e.preventDefault();
      draft.dnd.drop();
    },
  };
}

function dragSourceProps(draft: ChapterDraft, id: Id, imageOf?: () => HTMLElement | null) {
  return {
    draggable: true,
    onDragStart: (e: ReactDragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(SEGMENT_DRAG_TYPE, id);
      const image = imageOf?.();
      if (image) e.dataTransfer.setDragImage(image, 16, 16);
      // Changing the page inside dragstart can cancel the drag in some browsers.
      window.setTimeout(() => draft.dnd.start(id), 0);
    },
    onDragEnd: () => draft.dnd.end(),
  };
}

function dropMark(draft: ChapterDraft, id: Id): string {
  const { drag } = draft;
  if (!drag || drag.id === id || drag.overId !== id) return "";
  return drag.after ? "shadow-[0_2px_0_0_var(--color-primary)]" : "shadow-[0_-2px_0_0_var(--color-primary)]";
}

/** The segments of the open chapter, listed in the left menu. Drag a row to reorder. */
function SegmentMenu({ draft }: { draft: ChapterDraft }) {
  return (
    <div className="mb-1 ml-3 space-y-0.5 border-l border-border pl-2" aria-label="Segments of this chapter">
      {draft.segments.map((s, i) => (
        <div
          key={s.id}
          role="button"
          tabIndex={0}
          onClick={() => draft.select(s.id, true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") draft.select(s.id, true);
          }}
          {...dragSourceProps(draft, s.id)}
          {...dropTargetProps(draft, s.id)}
          className={cn(
            "flex cursor-grab items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors",
            s.id === draft.selectedId ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
            draft.drag?.id === s.id && "opacity-40",
            dropMark(draft, s.id),
          )}
        >
          <GripVertical className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{s.title || `Segment ${i + 1}`}</span>
          <span className="shrink-0 text-[10px]">{segmentWords(s).toLocaleString()}</span>
        </div>
      ))}
      <button
        onClick={() => draft.addSegment()}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/50"
      >
        <Plus className="size-3" /> Add segment
      </button>
    </div>
  );
}

function SegmentCard({ draft, segment, index }: { draft: ChapterDraft; segment: Segment; index: number }) {
  const selected = segment.id === draft.selectedId;
  return (
    <div
      id={`segment-${segment.id}`}
      {...dropTargetProps(draft, segment.id)}
      className={cn(
        "rounded-lg border bg-card transition-shadow",
        selected ? "border-ring ring-2 ring-ring/40" : "border-border",
        draft.drag?.id === segment.id && "opacity-40",
        dropMark(draft, segment.id),
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-2 py-1">
        <span
          {...dragSourceProps(draft, segment.id, () => document.getElementById(`segment-${segment.id}`))}
          title="Drag to move this segment"
          aria-label="Drag to move this segment"
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <GripVertical className="size-4" />
        </span>
        <Input
          value={segment.title}
          hint={`Segment ${index + 1}`}
          aria-label="Segment name"
          onFocus={() => draft.select(segment.id, false)}
          onChange={(e) => draft.renameSegment(segment.id, e.target.value)}
          className="h-7 border-0 bg-transparent px-1 text-sm font-medium shadow-none focus-visible:ring-0"
        />
        <span className="shrink-0 text-xs text-muted-foreground">{segmentWords(segment).toLocaleString()} words</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          title="Add a segment below this one"
          onClick={() => draft.addSegment(segment.id)}
        >
          <Plus />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          title="Delete this segment"
          disabled={draft.segments.length < 2}
          onClick={() => draft.removeSegment(segment.id)}
        >
          <Trash2 />
        </Button>
      </div>
      <EditableHtml
        initialHtml={segment.html}
        onChange={(html) => draft.editSegment(segment.id, html)}
        onFocus={() => draft.select(segment.id, false)}
        className="px-6 py-4"
      />
    </div>
  );
}

interface MenuProps {
  chapters: Chapter[];
  currentId: Id | undefined;
  numbers: Map<Id, number>;
  onSelect: (id: Id) => void;
  onAdd: (kind: ChapterKind) => void;
  /** Shown under the open chapter. */
  segmentList?: ReactNode;
}

/** The left menu: front matter, chapters and back matter, with the open chapter's segments beneath it. */
function ChapterMenu({ chapters, currentId, numbers, onSelect, onAdd, segmentList }: MenuProps) {
  return (
    <aside className="w-64 shrink-0 space-y-4 overflow-y-auto border-r border-border p-3">
      {KINDS.map((kind) => {
        const group = chapters.filter((c) => c.kind === kind);
        return (
          <div key={kind}>
            <div className="mb-1 flex items-center justify-between px-2">
              <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {CHAPTER_KIND_LABEL[kind]}
              </h2>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                title={`Add to ${CHAPTER_KIND_LABEL[kind].toLowerCase()}`}
                onClick={() => onAdd(kind)}
              >
                <Plus />
              </Button>
            </div>
            {group.map((c) => (
              <div key={c.id}>
                <button
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    c.id === currentId ? "bg-accent font-medium" : "hover:bg-accent/50",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {numbers.has(c.id) ? `${numbers.get(c.id)}. ` : ""}
                    {c.title || "Untitled"}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{c.wordCount.toLocaleString()}</span>
                </button>
                {c.id === currentId ? segmentList : null}
              </div>
            ))}
            {group.length === 0 ? <p className="px-2 text-xs text-muted-foreground">None yet</p> : null}
          </div>
        );
      })}
    </aside>
  );
}

/** The open chapter: its menu entry with segments, and the writing block made of segments. */
function ChapterDesk({ chapter, menu }: { chapter: Chapter; menu: Omit<MenuProps, "segmentList"> }) {
  const draft = useChapterDraft(chapter);

  return (
    <>
      <ChapterMenu {...menu} segmentList={<SegmentMenu draft={draft} />} />
      <section className="min-w-0 flex-1">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-2">
            <Input
              value={draft.title}
              hint="Chapter title"
              className="h-9 border-0 bg-transparent px-0 font-serif text-lg font-semibold shadow-none focus-visible:ring-0"
              onChange={(e) => draft.setTitle(e.target.value)}
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {draft.segments.length} {draft.segments.length === 1 ? "segment" : "segments"} · {draft.words.toLocaleString()} words ·{" "}
              {draft.saved ? "Saved" : "Saving..."}
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
          <EditorToolbar />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl space-y-4 px-6 py-6">
              {draft.segments.map((s, i) => (
                <SegmentCard key={s.id} draft={draft} segment={s} index={i} />
              ))}
              <Button variant="outline" className="w-full border-dashed" onClick={() => draft.addSegment()}>
                <Plus /> Add segment
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
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

  const menu = { chapters: chapters ?? [], currentId: current?.id, numbers, onSelect: setChapterId, onAdd: (k: ChapterKind) => void add(k) };

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
        {chapters === undefined ? null : current ? (
          <ChapterDesk key={current.id} chapter={current} menu={menu} />
        ) : (
          <>
            <ChapterMenu {...menu} />
            <section className="min-w-0 flex-1">
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <h2 className="font-serif text-xl font-semibold">Nothing written yet</h2>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Add your first chapter, or open an item in the Outline and choose Start writing this.
                </p>
                <Button onClick={() => void add("chapter")}>
                  <Plus /> Add first chapter
                </Button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export function Write() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <WriteBody key={manuscript.id} manuscript={manuscript} />;
}
