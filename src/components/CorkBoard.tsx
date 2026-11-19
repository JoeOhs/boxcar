import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Check, Copy, Orbit, Palette, Plus, StickyNote, Trash2 } from "lucide-react";
import type { CorkNote, Id } from "@/db/schema";
import { AGENT_LABEL } from "@/lib/ai";
import {
  CORK_NOTE_COLORS,
  CORK_NOTE_HEIGHT,
  CORK_NOTE_WIDTH,
  corkNoteToUniverseNode,
  createCorkNote,
  deleteCorkNote,
  patchCorkNote,
  useCorkNotes,
} from "@/lib/corkboard";
import { Button } from "@/components/ui/button";

/** The cork, drawn with two layers of specks over the cork colour. */
const CORK_STYLE = {
  backgroundColor: "var(--cork)",
  backgroundImage:
    "radial-gradient(var(--cork-speck) 1px, transparent 1.5px), radial-gradient(var(--cork-speck) 0.8px, transparent 1.2px)",
  backgroundSize: "14px 14px, 9px 9px",
  backgroundPosition: "0 0, 5px 7px",
};

/** A small tilt per note, the same every time, so the board looks pinned by hand. */
function tiltOf(id: Id): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 5) - 2) * 0.8;
}

interface Drag {
  id: Id;
  /** Where on the note the pointer took hold, so the note does not jump under it. */
  dx: number;
  dy: number;
  x: number;
  y: number;
}

/**
 * The Cork board: notes pinned for later, most of them sent from an AI chat with
 * "Send to Universe". Notes are dragged anywhere, written on, recoloured, copied,
 * turned into a Universe node, or taken down.
 */
export function CorkBoard({ manuscriptId, onOpenNode }: { manuscriptId: Id; onOpenNode: (nodeId: Id) => void }) {
  const notes = useCorkNotes(manuscriptId);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The note last touched lies on top of the others. */
  const [topId, setTopId] = useState<Id | null>(null);
  const [editingId, setEditingId] = useState<Id | null>(null);

  // The board grows to hold the furthest note, plus room to drag past it.
  const width = Math.max(0, ...(notes ?? []).map((n) => n.x)) + CORK_NOTE_WIDTH + 240;
  const height = Math.max(0, ...(notes ?? []).map((n) => n.y)) + CORK_NOTE_HEIGHT + 240;

  function boardPoint(e: ReactPointerEvent) {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDrag(e: ReactPointerEvent<HTMLDivElement>, note: CorkNote) {
    // Writing in a note, or pressing one of its buttons, is not a drag.
    if ((e.target as HTMLElement).closest("textarea, button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = boardPoint(e);
    setTopId(note.id);
    setDrag({ id: note.id, dx: p.x - note.x, dy: p.y - note.y, x: note.x, y: note.y });
  }

  function moveDrag(e: ReactPointerEvent) {
    if (!drag) return;
    const p = boardPoint(e);
    setDrag({ ...drag, x: Math.max(0, p.x - drag.dx), y: Math.max(0, p.y - drag.dy) });
  }

  function endDrag() {
    if (!drag) return;
    void patchCorkNote(drag.id, { x: Math.round(drag.x), y: Math.round(drag.y) });
    setDrag(null);
  }

  async function add() {
    const note = await createCorkNote(manuscriptId, "");
    setTopId(note.id);
    setEditingId(note.id);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-2">
        <p className="text-sm text-muted-foreground">
          Replies sent from any AI chat with <Orbit className="inline size-3.5 align-[-2px]" /> land here. Drag notes around,
          double-click to write on one.
        </p>
        <Button size="sm" variant="outline" onClick={() => void add()}>
          <Plus /> Add note
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto" style={CORK_STYLE}>
        <div ref={boardRef} className="relative" style={{ width, height, minWidth: "100%", minHeight: "100%" }}>
          {notes?.length === 0 ? (
            <div className="absolute left-1/2 top-24 w-80 -translate-x-1/2 rounded-md bg-background/90 p-4 text-center text-sm text-muted-foreground shadow">
              <StickyNote className="mx-auto mb-2 size-5" />
              The Cork board is empty. Press <Orbit className="inline size-3.5 align-[-2px]" /> under an AI reply to pin it here,
              or add your own note.
            </div>
          ) : null}
          {notes?.map((note) => {
            const dragging = drag?.id === note.id;
            const x = dragging ? drag.x : note.x;
            const y = dragging ? drag.y : note.y;
            return (
              <NoteCard
                key={note.id}
                note={note}
                style={{
                  left: x,
                  top: y,
                  zIndex: dragging ? 30 : note.id === topId ? 20 : 1,
                  transform: `rotate(${dragging ? 0 : tiltOf(note.id)}deg)`,
                }}
                lifted={dragging}
                editing={editingId === note.id}
                onEdit={(on) => setEditingId(on ? note.id : null)}
                onPointerDown={(e) => startDrag(e, note)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onOpenNode={onOpenNode}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface NoteCardProps {
  note: CorkNote;
  style: CSSProperties;
  lifted: boolean;
  editing: boolean;
  onEdit: (on: boolean) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onOpenNode: (nodeId: Id) => void;
}

function NoteCard({ note, style, lifted, editing, onEdit, onPointerDown, onPointerMove, onPointerUp, onOpenNode }: NoteCardProps) {
  const [text, setText] = useState(note.text);
  const [copied, setCopied] = useState(false);

  function save() {
    onEdit(false);
    if (text !== note.text) void patchCorkNote(note.id, { text });
  }

  function recolor() {
    const next = CORK_NOTE_COLORS[(CORK_NOTE_COLORS.indexOf(note.color) + 1) % CORK_NOTE_COLORS.length];
    void patchCorkNote(note.id, { color: next });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(note.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // The clipboard can be refused (browser permission); the text can still be selected by hand.
    }
  }

  async function toUniverse() {
    onOpenNode(await corkNoteToUniverseNode(note));
  }

  function remove() {
    if (note.text.trim() && !window.confirm("Take this note off the Cork board?")) return;
    void deleteCorkNote(note.id);
  }

  return (
    <div
      data-testid="cork-note"
      className={
        "group absolute flex cursor-grab touch-none select-none flex-col rounded-sm transition-shadow active:cursor-grabbing " +
        (lifted ? "shadow-2xl" : "shadow-md hover:shadow-lg")
      }
      style={{
        ...style,
        width: CORK_NOTE_WIDTH,
        height: CORK_NOTE_HEIGHT,
        backgroundColor: `var(--note-${note.color})`,
        color: "var(--note-ink)",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onEdit(true)}
    >
      {/* The pushpin. */}
      <span className="absolute -top-1.5 left-1/2 size-3.5 -translate-x-1/2 rounded-full bg-destructive shadow-[0_2px_2px_rgba(0,0,0,0.35)] ring-1 ring-black/20" />
      <div className="flex items-center justify-between px-2.5 pt-2.5 text-[10px] font-medium uppercase tracking-wide opacity-60">
        <span className="truncate">{note.fromRole ? AGENT_LABEL[note.fromRole] : "My note"}</span>
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText(note.text);
              onEdit(false);
            }
          }}
          aria-label="Note text"
          className="min-h-0 flex-1 resize-none bg-transparent px-2.5 py-1 text-[13px] leading-snug outline-none"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-2.5 py-1 text-[13px] leading-snug">
          {note.text.trim() ? note.text : <span className="opacity-50">Double-click to write.</span>}
        </div>
      )}
      <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <NoteAction title="Change colour" onClick={recolor}>
          <Palette />
        </NoteAction>
        <NoteAction title="Copy" onClick={() => void copy()}>
          {copied ? <Check /> : <Copy />}
        </NoteAction>
        <NoteAction title="Make it a Universe node" onClick={() => void toUniverse()} disabled={!note.text.trim()}>
          <Orbit />
        </NoteAction>
        <NoteAction title="Take the note down" onClick={remove}>
          <Trash2 />
        </NoteAction>
      </div>
    </div>
  );
}

function NoteAction({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 hover:bg-black/10 disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}
