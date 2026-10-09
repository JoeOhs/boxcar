import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  IndentDecrease,
  IndentIncrease,
  ListPlus,
  PenLine,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { deleteOutlineItem, type Id, type Manuscript, type OutlineItem, type OutlineKind } from "@/db/schema";
import { genreById, genreContext } from "@/lib/genres";
import { useOutlineItems } from "@/lib/hooks";
import { flattenOutline, OUTLINE_KIND_LABEL, outlineToText } from "@/lib/outline";
import {
  addOutlineItem,
  applyGenreStructure,
  applyThreeActTemplate,
  chapterForOutlineItem,
  chaptersFromOutline,
  moveOutlineItem,
  patchOutlineItem,
} from "@/lib/store";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { AgentChat } from "@/components/AgentChat";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function ItemForm({ item, onWrite }: { item: OutlineItem; onWrite: () => void }) {
  const [title, setTitle] = useState(item.title);
  const [summary, setSummary] = useState(item.summary);
  const [notes, setNotes] = useState(item.notes);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Notes can also change from outside (the outliner adds replies); follow them unless the author is typing here.
  useEffect(() => {
    if (document.activeElement !== notesRef.current) setNotes(item.notes);
  }, [item.notes]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_9rem] gap-3">
        <div className="space-y-1">
          <Label htmlFor="o-title">Title</Label>
          <Input
            id="o-title"
            value={title}
            hint={`${OUTLINE_KIND_LABEL[item.kind]} title`}
            onChange={(e) => {
              setTitle(e.target.value);
              void patchOutlineItem(item.id, { title: e.target.value });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="o-kind">Kind</Label>
          <Select
            id="o-kind"
            value={item.kind}
            onChange={(e) => void patchOutlineItem(item.id, { kind: e.target.value as OutlineKind })}
          >
            {(Object.keys(OUTLINE_KIND_LABEL) as OutlineKind[]).map((k) => (
              <option key={k} value={k}>
                {OUTLINE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="o-summary">What happens</Label>
        <Textarea
          id="o-summary"
          rows={5}
          value={summary}
          hint="Describe what happens here, in your own words."
          onChange={(e) => {
            setSummary(e.target.value);
            void patchOutlineItem(item.id, { summary: e.target.value });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="o-notes">Notes</Label>
        <Textarea
          id="o-notes"
          ref={notesRef}
          rows={5}
          value={notes}
          hint="Characters, setting, themes, things to remember."
          onChange={(e) => {
            setNotes(e.target.value);
            void patchOutlineItem(item.id, { notes: e.target.value });
          }}
        />
      </div>
      <Button variant="outline" onClick={onWrite}>
        <PenLine /> {item.chapterId ? "Open the written chapter" : "Start writing this"}
      </Button>
    </div>
  );
}

function OutlineBody({ manuscript }: { manuscript: Manuscript }) {
  const { navigate, setChapterId } = useApp();
  const items = useOutlineItems(manuscript.id);
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [showAi, setShowAi] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const genre = genreById(manuscript.genre);
  const rows = useMemo(() => flattenOutline(items ?? []), [items]);
  const selected = items?.find((i) => i.id === selectedId);

  async function add(parentId: Id | null) {
    const created = await addOutlineItem(manuscript.id, parentId);
    setSelectedId(created.id);
  }

  async function remove(item: OutlineItem) {
    if (!window.confirm(`Delete "${item.title || "Untitled"}" and everything under it? Written chapters are kept.`)) return;
    await deleteOutlineItem(item.id);
    setSelectedId(null);
  }

  async function write(item: OutlineItem) {
    const chapterId = await chapterForOutlineItem(item);
    setChapterId(chapterId);
    navigate("write");
  }

  async function makeChapters() {
    // In outline order, so the chapters land in the book in the order the author planned them.
    const made = await chaptersFromOutline(rows.map((row) => row.item));
    setNotice(made > 0 ? `Created ${made} chapter${made === 1 ? "" : "s"} in Write.` : "Every outline chapter already has its text.");
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
      <Button size="sm" onClick={() => void add(null)}>
        <Plus /> Add
      </Button>
      <Button size="sm" variant="outline" disabled={!selected} onClick={() => selected && void add(selected.id)}>
        <ListPlus /> Add inside
      </Button>
      <div className="mx-1 h-5 w-px bg-border" />
      <Button size="icon" variant="ghost" title="Move up" disabled={!selected} onClick={() => selected && void moveOutlineItem(selected.id, "up")}>
        <ArrowUp />
      </Button>
      <Button size="icon" variant="ghost" title="Move down" disabled={!selected} onClick={() => selected && void moveOutlineItem(selected.id, "down")}>
        <ArrowDown />
      </Button>
      <Button size="icon" variant="ghost" title="Make part of the item above" disabled={!selected} onClick={() => selected && void moveOutlineItem(selected.id, "indent")}>
        <IndentIncrease />
      </Button>
      <Button size="icon" variant="ghost" title="Move out one level" disabled={!selected} onClick={() => selected && void moveOutlineItem(selected.id, "outdent")}>
        <IndentDecrease />
      </Button>
      <Button size="icon" variant="ghost" title="Delete" disabled={!selected} onClick={() => selected && void remove(selected)}>
        <Trash2 />
      </Button>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Outline"
        description={`The bones of ${manuscript.title}. Build acts, chapters, scenes and beats, then write from them.`}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => void makeChapters()}>
              Create chapters from outline
            </Button>
            <Button variant={showAi ? "secondary" : "outline"} size="sm" onClick={() => setShowAi((v) => !v)}>
              <Sparkles /> Outliner
            </Button>
          </>
        }
      />
      {notice ? (
        <div className="border-b border-border bg-muted px-6 py-1.5 text-xs text-muted-foreground">{notice}</div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <section className="flex w-96 shrink-0 flex-col border-r border-border">
          {toolbar}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {items === undefined ? null : rows.length === 0 ? (
              <div className="space-y-3 p-4 text-sm text-muted-foreground">
                <p>
                  The outline is empty. Add your first item, or begin with {genre ? "the structure for your genre" : "a classic three-act structure"}.
                </p>
                {genre ? (
                  <Button size="sm" className="mr-2" onClick={() => void applyGenreStructure(manuscript.id, genre)}>
                    Start with the {genre.label.toLowerCase()} structure
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => void applyThreeActTemplate(manuscript.id)}>
                  Start with three acts
                </Button>
              </div>
            ) : (
              rows.map(({ item, depth }) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors",
                    item.id === selectedId ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <Badge variant="outline" className="shrink-0">
                    {OUTLINE_KIND_LABEL[item.kind]}
                  </Badge>
                  <span className={cn("min-w-0 flex-1 truncate", !item.title && "text-muted-foreground")}>
                    {item.title || "Untitled"}
                  </span>
                  {item.chapterId ? <PenLine className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <div className="max-w-2xl">
              <ItemForm key={selected.id} item={selected} onWrite={() => void write(selected)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select an item in the outline to edit it.</p>
          )}
        </section>

        {showAi ? (
          <aside className="w-80 shrink-0 border-l border-border">
            <AgentChat
              manuscriptId={manuscript.id}
              role="outliner"
              getContext={() =>
                [
                  `Title: ${manuscript.title}`,
                  genreContext(genre),
                  manuscript.description ? `Description: ${manuscript.description}` : "",
                  `Outline:\n${outlineToText(items ?? [])}`,
                  selected
                    ? `Selected item: [${selected.kind}] ${selected.title}\nSummary: ${selected.summary}\nNotes: ${selected.notes}`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n\n")
              }
              quickPrompts={[
                { label: "Suggest beats", prompt: "Suggest the key beats for the selected item, as a short list." },
                { label: "Find gaps", prompt: "Read my outline and point out the biggest gaps or pacing problems." },
              ]}
              onUseReply={
                selected
                  ? {
                      label: "Add to notes",
                      run: (text) => void patchOutlineItem(selected.id, { notes: (selected.notes ? selected.notes + "\n\n" : "") + text }),
                    }
                  : undefined
              }
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function Outline() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <OutlineBody key={manuscript.id} manuscript={manuscript} />;
}
