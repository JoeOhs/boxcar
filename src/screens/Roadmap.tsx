import { useEffect, useState, type DragEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Check, Flag, Plus, Trash2 } from "lucide-react";
import { db, type Id, type Manuscript, type ManuscriptStatus, type RoadmapCard } from "@/db/schema";
import {
  addRoadmapCard,
  deleteRoadmapCard,
  moveRoadmapCard,
  ROADMAP_COLUMNS,
  seedRoadmap,
  setRoadmapCardDone,
} from "@/lib/roadmap";
import { patchManuscript } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useApp, type Screen } from "@/state/AppState";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CARD_DRAG_TYPE = "application/x-boxcar-card";

interface DragState {
  id: Id;
  overColumn: ManuscriptStatus | null;
  overCard: Id | null;
}

function AddCard({ manuscriptId, column }: { manuscriptId: Id; column: ManuscriptStatus }) {
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void addRoadmapCard(manuscriptId, column, title);
        setTitle("");
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} hint="Add a card" className="h-8 text-xs" />
      <Button type="submit" size="icon" variant="outline" title="Add card" disabled={!title.trim()}>
        <Plus />
      </Button>
    </form>
  );
}

function RoadmapBody({ manuscript }: { manuscript: Manuscript }) {
  const { navigate } = useApp();
  const [drag, setDrag] = useState<DragState | null>(null);

  // Books made before the Roadmap existed get their first cards the first time it is opened.
  useEffect(() => {
    if (!manuscript.roadmapSeeded) void seedRoadmap(manuscript.id);
  }, [manuscript.id, manuscript.roadmapSeeded]);

  const cards = useLiveQuery(async () => {
    const rows = await db.roadmapCards.where("manuscriptId").equals(manuscript.id).toArray();
    return rows.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }, [manuscript.id]);

  const total = cards?.length ?? 0;
  const done = cards?.filter((c) => c.done).length ?? 0;
  const currentIndex = ROADMAP_COLUMNS.findIndex((c) => c.id === manuscript.status);

  function stepColumn(card: RoadmapCard, step: -1 | 1) {
    const index = ROADMAP_COLUMNS.findIndex((c) => c.id === card.column) + step;
    const target = ROADMAP_COLUMNS[index];
    if (target) void moveRoadmapCard(card.id, target.id, null);
  }

  function finishDrag(column: ManuscriptStatus, beforeId: Id | null) {
    if (drag) void moveRoadmapCard(drag.id, column, beforeId);
    setDrag(null);
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Roadmap"
        description={`${manuscript.title}: from outline to publish. ${done} of ${total} steps done.`}
        actions={
          currentIndex >= 0 ? (
            <Badge variant="outline">Now: {ROADMAP_COLUMNS[currentIndex].label}</Badge>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex h-full min-w-max gap-4">
          {ROADMAP_COLUMNS.map((column, columnIndex) => {
            const inColumn = (cards ?? []).filter((c) => c.column === column.id);
            const finished = inColumn.filter((c) => c.done).length;
            const current = column.id === manuscript.status;
            const dropHere = drag?.overColumn === column.id;
            return (
              <section
                key={column.id}
                aria-label={column.label}
                onDragOver={(e: DragEvent<HTMLElement>) => {
                  if (!drag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (drag.overColumn !== column.id) setDrag({ ...drag, overColumn: column.id, overCard: null });
                }}
                onDrop={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  finishDrag(column.id, drag.overColumn === column.id ? drag.overCard : null);
                }}
                className={cn(
                  "flex h-full w-72 shrink-0 flex-col rounded-lg border bg-muted/40 transition-colors",
                  current ? "border-primary/60" : "border-border",
                  dropHere && "bg-accent/60",
                )}
              >
                <header className="space-y-1 border-b border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-serif text-base font-semibold">
                      {columnIndex + 1}. {column.label}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      {finished}/{inColumn.length}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{column.blurb}</p>
                  {current ? (
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <Flag className="size-3" /> The book is here now
                    </p>
                  ) : (
                    <button
                      className="text-xs text-muted-foreground underline"
                      onClick={() => void patchManuscript(manuscript.id, { status: column.id })}
                    >
                      Mark as the current stage
                    </button>
                  )}
                </header>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {inColumn.map((card) => (
                    <article
                      key={card.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(CARD_DRAG_TYPE, card.id);
                        window.setTimeout(() => setDrag({ id: card.id, overColumn: null, overCard: null }), 0);
                      }}
                      onDragEnd={() => setDrag(null)}
                      onDragOver={(e) => {
                        if (!drag || drag.id === card.id) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        if (drag.overCard !== card.id || drag.overColumn !== column.id) {
                          setDrag({ ...drag, overColumn: column.id, overCard: card.id });
                        }
                      }}
                      className={cn(
                        "cursor-grab space-y-2 rounded-md border border-border bg-card p-2.5 text-sm shadow-xs",
                        drag?.id === card.id && "opacity-40",
                        drag?.overCard === card.id && drag.id !== card.id && "shadow-[0_-2px_0_0_var(--color-primary)]",
                      )}
                    >
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={card.done}
                          onChange={(e) => void setRoadmapCardDone(card.id, e.target.checked)}
                          className="mt-0.5 size-4 accent-primary"
                        />
                        <span className={cn("min-w-0 flex-1", card.done && "text-muted-foreground line-through")}>{card.title}</span>
                        {card.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : null}
                      </label>
                      <div className="flex items-center gap-1">
                        {card.screen ? (
                          <Button size="sm" variant="outline" className="h-7" onClick={() => navigate(card.screen as Screen)}>
                            Open
                          </Button>
                        ) : null}
                        <span className="flex-1" />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title="Move to the previous stage"
                          disabled={columnIndex === 0}
                          onClick={() => stepColumn(card, -1)}
                        >
                          <ArrowLeft />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          title="Move to the next stage"
                          disabled={columnIndex === ROADMAP_COLUMNS.length - 1}
                          onClick={() => stepColumn(card, 1)}
                        >
                          <ArrowRight />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" title="Delete this card" onClick={() => void deleteRoadmapCard(card.id)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </article>
                  ))}
                  {inColumn.length === 0 ? <p className="px-1 text-xs text-muted-foreground">Nothing here yet. Drag a card in, or add one.</p> : null}
                </div>

                <div className="border-t border-border p-2">
                  <AddCard manuscriptId={manuscript.id} column={column.id} />
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Roadmap() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <RoadmapBody key={manuscript.id} manuscript={manuscript} />;
}
