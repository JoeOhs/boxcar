import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, FileUp, Library, Plus, Trash2, UserRound } from "lucide-react";
import {
  db,
  deleteManuscript,
  deleteWorkspace,
  type Id,
  type Manuscript,
  type ManuscriptStatus,
  type ManuscriptType,
  type Workspace,
} from "@/db/schema";
import { BOOK_TYPE_ORDER, BOOK_TYPES, bookTypeOf } from "@/lib/bookTypes";
import { mockupLook } from "@/lib/coverMockup";
import { IMPORT_ACCEPT } from "@/lib/documents";
import { genreById, type Genre } from "@/lib/genres";
import { importManuscript, planImport, type ImportPlan } from "@/lib/importManuscript";
import { addSeriesBookTo, createManuscript, createSeries, goalWordCount, patchManuscript, patchWorkspace } from "@/lib/store";
import { countWords } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { BlendPicker, GenrePicker } from "@/components/GenrePicker";
import { CoverMockup } from "@/components/CoverMockup";
import { PenNamePicker } from "@/components/PenNamePicker";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STATUS_LABEL: Record<ManuscriptStatus, string> = {
  outlining: "Outlining",
  drafting: "Drafting",
  editing: "Editing",
  formatting: "Formatting",
  ready: "Ready to publish",
};

const SERIES_BOOK_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];

function WorkspaceForm({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState(workspace.name);
  const [bio, setBio] = useState(workspace.bio);
  const { workspaces, selectWorkspace } = useApp();

  async function remove() {
    if (!window.confirm(`Delete ${workspace.name || "this workspace"} and every manuscript in it? This cannot be undone.`)) return;
    const next = workspaces.find((w) => w.id !== workspace.id);
    await deleteWorkspace(workspace.id);
    if (next) selectWorkspace(next.id);
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-1">
        <Label htmlFor="ws-name">Author / pen name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            void patchWorkspace(workspace.id, { name: e.target.value.trim() });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ws-bio">About this author</Label>
        <Textarea
          id="ws-bio"
          value={bio}
          rows={3}
          onChange={(e) => {
            setBio(e.target.value);
            void patchWorkspace(workspace.id, { bio: e.target.value });
          }}
        />
      </div>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove()}>
        <Trash2 /> Delete this workspace
      </Button>
    </Card>
  );
}

/**
 * The word-count goal for a book being created. It follows the genre's typical
 * length until the author types a goal of their own; either way it is fixed once
 * the book is made.
 */
function WordGoalField({
  idPrefix,
  type,
  genre,
  goal,
  setGoal,
}: {
  idPrefix: string;
  type: ManuscriptType;
  genre: Genre | undefined;
  /** null means "follow the genre and type". */
  goal: number | null;
  setGoal: (goal: number | null) => void;
}) {
  const suggested = goalWordCount(genre, type);
  const value = goal ?? suggested;
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor={idPrefix + "-goal"}>{type === "series" ? "Word-count goal per book" : "Word-count goal"}</Label>
          <Input
            id={idPrefix + "-goal"}
            type="number"
            min={0}
            step={1000}
            className="w-40"
            value={value}
            onChange={(e) => setGoal(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          />
        </div>
        <p className="pb-1.5 text-xs text-muted-foreground">
          {goal === null
            ? `Following the ${genre ? `${genre.label.toLowerCase()} guide` : `${BOOK_TYPES[type].label.toLowerCase()} default`}: ${suggested.toLocaleString()} words.`
            : `Your own goal. The suggestion was ${suggested.toLocaleString()} words.`}
        </p>
        {goal !== null ? (
          <Button size="sm" variant="ghost" onClick={() => setGoal(null)}>
            Use the suggested length
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">Set when the book is created. It cannot be changed afterwards.</p>
    </div>
  );
}

type Pane = "manuscript" | "new" | "author";

/**
 * The form for a new manuscript: a title, the type (short story, novella, novel
 * or series), the genre guide, the word-count goal and the pen name. The pen name
 * generator is part of this form, so the suggestions depend on the genre chosen here.
 *
 * Layout: Title beside Type; under Title the Genre dropdown, under Type the
 * Fiction / Non-fiction buttons; the guide, the goal and the pen name below.
 */
function NewManuscriptForm({
  workspace,
  onCancel,
  needsPenName,
}: {
  workspace: Workspace;
  onCancel: (() => void) | null;
  /** True when the workspace has no pen name yet, so the form opens on the generator. */
  needsPenName: boolean;
}) {
  const { selectManuscript, navigate } = useApp();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ManuscriptType>("novel");
  const [bookCount, setBookCount] = useState(3);
  const [genreId, setGenreId] = useState<string | undefined>(undefined);
  const [goal, setGoal] = useState<number | null>(null);
  const [startOutline, setStartOutline] = useState(true);
  const [busy, setBusy] = useState(false);
  const genre = genreById(genreId);
  const info = BOOK_TYPES[type];

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const targetWords = goal ?? undefined;
      if (type === "series") {
        const { books } = await createSeries(workspace, title, bookCount, genre, startOutline && !!genre, targetWords);
        selectManuscript(books[0].id);
      } else {
        const created = await createManuscript(workspace, title, genre, startOutline && !!genre, type, targetWords);
        selectManuscript(created.id);
      }
      navigate("roadmap");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl space-y-5 p-5">
      <h2 className="font-serif text-lg font-semibold">{needsPenName ? "Choose a pen name" : "New manuscript"}</h2>
      {needsPenName ? (
        <p className="text-sm text-muted-foreground">
          This workspace has no pen name yet. Choose the genre of the book you are starting, then generate a pen name for it or
          type your own. It goes on the title page and the cover.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <div className="space-y-1">
          <Label htmlFor="new-title">Title</Label>
          <Input id="new-title" value={title} autoFocus hint="Working title is fine" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-type">Type</Label>
          <Select id="new-type" value={type} onChange={(e) => setType(e.target.value as ManuscriptType)}>
            {BOOK_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {BOOK_TYPES[t].label}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{info.description}</p>
        </div>
        <GenrePicker idPrefix="new" value={genreId} onChange={setGenreId} />
        <WordGoalField idPrefix="new" type={type} genre={genre} goal={goal} setGoal={setGoal} />
      </div>

      {type === "series" ? (
        <div className="space-y-1">
          <Label htmlFor="new-books">Number of books</Label>
          <Select id="new-books" className="w-32" value={bookCount} onChange={(e) => setBookCount(Number(e.target.value))}>
            {SERIES_BOOK_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} books
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Each book is made as Book 1, Book 2 and so on. Choose the book to outline from the Universe screen.
          </p>
        </div>
      ) : null}

      {genre ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={startOutline} onChange={(e) => setStartOutline(e.target.checked)} />
          <span>
            Start the outline with the {genre.label.toLowerCase()} structure
            <span className="block text-xs text-muted-foreground">
              Also sets the genre's keywords. The goal above stays as you set it.
            </span>
          </span>
        </label>
      ) : null}

      <PenNamePicker
        key={genreId ?? "no-genre"}
        idPrefix="new"
        title={title}
        genre={genre}
        currentName={workspace.name}
        onChoose={(name) => patchWorkspace(workspace.id, { name })}
      />

      <div className="flex gap-2">
        <Button disabled={!title.trim() || busy} onClick={() => void create()}>
          <Plus /> {type === "series" ? "Create series" : "Create manuscript"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Brings a manuscript in from a file: .txt, .md, .html, .docx or .epub. Its genre and goal are chosen here. */
function ImportManuscriptForm({
  workspace,
  onCancel,
  onImported,
}: {
  workspace: Workspace;
  onCancel: (() => void) | null;
  onImported?: (manuscriptId: Id) => void;
}) {
  const { selectManuscript } = useApp();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [genreId, setGenreId] = useState<string | undefined>(undefined);
  const [goal, setGoal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const genre = genreById(genreId);

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPlan(null);
    try {
      const found = await planImport(file);
      setPlan(found);
      setTitle(found.title);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!plan || !title.trim() || busy) return;
    setBusy(true);
    try {
      const created = await importManuscript(workspace, plan, title.trim(), genre, goal ?? undefined);
      selectManuscript(created.id);
      onImported?.(created.id);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The manuscript could not be imported.");
      setBusy(false);
    }
  }

  const words = plan ? plan.chapters.reduce((sum, c) => sum + countWords(c.html), 0) : 0;

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <h2 className="font-serif text-lg font-semibold">Import a manuscript</h2>
      <p className="text-sm text-muted-foreground">
        Choose a Word document (.docx), an epub, an HTML file, or a text or Markdown file. It is added to {workspace.name || "this workspace"} and cut into
        chapters at its headings, or at lines such as "Chapter 1".
      </p>
      <Button asChild variant="outline" className={cn(busy && "pointer-events-none opacity-50")}>
        <label className="cursor-pointer">
          <FileUp /> {plan ? "Choose a different file" : "Choose a file"}
          <input
            type="file"
            accept={IMPORT_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {plan ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
            <div className="space-y-1">
              <Label htmlFor="import-title">Title</Label>
              <Input id="import-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <GenrePicker idPrefix="import" value={genreId} onChange={setGenreId} />
            <WordGoalField idPrefix="import" type="novel" genre={genre} goal={goal} setGoal={setGoal} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {fileName}: {plan.chapters.length} {plan.chapters.length === 1 ? "section" : "sections"}, {words.toLocaleString()} words
            </p>
            <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-2 text-sm">
              {plan.chapters.map((c, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {c.kind === "chapter" ? `${c.title || "Untitled chapter"}` : `${c.title} (${c.kind === "front" ? "front matter" : "back matter"})`}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{countWords(c.html).toLocaleString()} words</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={!plan || !title.trim() || busy} onClick={() => void run()}>
          <FileUp /> {busy ? "Working..." : "Import manuscript"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** The name of the book, editable because working titles change before a book is finished. */
export function TitleEditor({ manuscript }: { manuscript: Manuscript }) {
  const [title, setTitle] = useState(manuscript.title);
  function save() {
    const clean = title.trim() || "Untitled manuscript";
    setTitle(clean);
    if (clean !== manuscript.title) void patchManuscript(manuscript.id, { title: clean });
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="book-title">Book title</Label>
      <Input
        id="book-title"
        value={title}
        className="h-11 border-0 bg-transparent px-0 font-serif text-2xl font-semibold shadow-none focus-visible:ring-0"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <p className="text-xs text-muted-foreground">Working titles are fine. You can rename the book at any time.</p>
    </div>
  );
}

/** The options of the manuscript chosen on the shelf, inside the floating card beside its cover. */
function ManuscriptOptions({ manuscript, words, seriesTitle }: { manuscript: Manuscript; words: number; seriesTitle?: string }) {
  const { manuscript: brought, selectManuscript } = useApp();
  const type = bookTypeOf(manuscript);
  const isBrought = brought?.id === manuscript.id;

  async function remove() {
    if (!window.confirm(`Delete "${manuscript.title}" with all its chapters and outline? This cannot be undone.`)) return;
    await deleteManuscript(manuscript.id);
  }

  async function addBook() {
    if (!manuscript.seriesId) return;
    const book = await addSeriesBookTo(manuscript.seriesId);
    if (book) selectManuscript(book.id);
  }

  return (
    <div className="space-y-5 border-t border-border pt-4">
      <div className="grid max-w-md grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Stage</Label>
          <p className="flex h-8 items-center text-sm font-medium">{STATUS_LABEL[manuscript.status]}</p>
          <p className="text-xs text-muted-foreground">Moves on as the Roadmap steps are ticked. It cannot go back.</p>
        </div>
        <div className="space-y-1">
          <Label>Word-count goal</Label>
          <p className="flex h-8 items-center text-sm font-medium tabular-nums">
            {manuscript.targetWordCount > 0 ? manuscript.targetWordCount.toLocaleString() : "None set"}
          </p>
          <p className="text-xs text-muted-foreground">Set at creation and locked.</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {BOOK_TYPES[type].label}
        {seriesTitle && manuscript.volumeNumber ? ` - Book ${manuscript.volumeNumber} of ${seriesTitle}` : ""}
        {" - "}
        {words.toLocaleString()} words
        {isBrought ? " - In the workspace" : " - On the shelf"}
      </p>
      {manuscript.seriesId ? (
        <Button variant="outline" size="sm" onClick={() => void addBook()}>
          <Plus /> Add another book to this series
        </Button>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <GenrePicker
          key={manuscript.id}
          idPrefix="options"
          value={manuscript.genre}
          locked={!!manuscript.genre}
          onChange={(genreId) => void patchManuscript(manuscript.id, { genre: genreId })}
        />
        <div className="sm:col-span-2">
          <BlendPicker
            primary={genreById(manuscript.genre)}
            value={manuscript.blendGenre}
            idPrefix="options"
            onChange={(genreId) => void patchManuscript(manuscript.id, { blendGenre: genreId })}
          />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          The genre, type and word-count goal are set when the book is created and stay as they are. Blending in a second genre is the one change allowed later.
        </p>
      </div>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove()}>
        <Trash2 /> Delete this manuscript
      </Button>
    </div>
  );
}

/** One book standing on the shelf as its spine. Clicking it pulls the book off the shelf. */
function Spine({
  manuscript,
  words,
  selected,
  brought,
  onClick,
}: {
  manuscript: Manuscript;
  words: number;
  selected: boolean;
  brought: boolean;
  onClick: () => void;
}) {
  const look = mockupLook(genreById(manuscript.genre));
  let hash = 7;
  for (const c of manuscript.id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  const seed = Math.abs(hash);
  const height = 158 + (seed % 5) * 9;
  const width = Math.max(30, Math.min(58, 28 + Math.round(words / 2400)));
  const lean = seed % 7 === 3;
  const tilt = lean ? (seed % 2 === 0 ? -1.2 : 1.1) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={manuscript.title}
      aria-label={`${manuscript.title}${brought ? " (in the workspace)" : ""}`}
      aria-pressed={selected}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-t-[2px] border border-black/10 transition-all duration-200",
        selected ? "z-10 -translate-y-2 scale-[1.04] shadow-[0_10px_24px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)] ring-2 ring-white/60" : "hover:-translate-y-3 hover:shadow-[0_10px_20px_rgba(0,0,0,0.45)]",
      )}
      style={{
        height,
        width,
        transform: selected ? undefined : tilt ? `rotate(${tilt}deg)` : undefined,
        background: `linear-gradient(90deg, rgba(0,0,0,0.42), rgba(255,255,255,0.18) 12%, rgba(255,255,255,0.06) 22%, rgba(0,0,0,0) 34%, rgba(0,0,0,0) 66%, rgba(0,0,0,0.32) 82%, rgba(0,0,0,0.45)), ${look.background}`,
        color: look.ink,
        boxShadow: selected ? undefined : "0 6px 14px rgba(0,0,0,0.42), inset 1px 0 0 rgba(255,255,255,0.35), inset -1px 0 0 rgba(0,0,0,0.25)",
      }}
    >
      {/* spine highlight */}
      <span className="pointer-events-none absolute inset-y-0 left-[3px] w-[2px] bg-white/35" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-y-0 right-0 w-[3px] bg-black/25" aria-hidden="true" />
      <span className="absolute inset-x-0 top-1.5 h-[3px] opacity-90" style={{ background: look.accent }} aria-hidden="true" />
      <span className="absolute inset-x-[7%] top-[13px] h-px bg-white/30" aria-hidden="true" />
      {seed % 3 === 0 ? <span className="absolute inset-x-[6%] top-5 h-px opacity-70" style={{ background: look.accent }} aria-hidden="true" /> : null}
      <span
        className="relative max-h-[86%] truncate px-1 font-semibold tracking-[0.03em] drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontFamily: look.fontFamily, fontSize: width > 42 ? 12.5 : 11, lineHeight: 1.15 }}
      >
        {manuscript.title || "Untitled"}
      </span>
      <span className="absolute inset-x-0 bottom-2 h-[3px] opacity-90" style={{ background: look.accent }} aria-hidden="true" />
      <span className="absolute inset-x-[7%] bottom-[11px] h-px bg-white/25" aria-hidden="true" />
      {brought ? (
        <span className="absolute bottom-[7px] left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.9)] ring-1 ring-black/30" title="In the workspace" />
      ) : null}
      {selected ? <span className="absolute inset-0 rounded-t-[2px] ring-1 ring-white/25" aria-hidden="true" /> : null}
    </button>
  );
}

/** A wooden shelf: the books stand on the plank, with its pale top edge, wood grain and dark front face beneath. */
function Shelf({ label, children }: { label?: string; children?: ReactNode }) {
  return (
    <div className="relative" aria-label={label}>
      {label ? (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="h-px flex-1 bg-[#e9dcc4]/20" aria-hidden="true" />
          <p className="shrink-0 rounded bg-[#1a1208]/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#f5e6c8] shadow-sm backdrop-blur-sm">{label}</p>
          <span className="h-px flex-1 bg-[#e9dcc4]/20" aria-hidden="true" />
        </div>
      ) : null}
      {/* wall shadow behind the row */}
      <div className="absolute inset-x-0 bottom-[22px] h-10 bg-gradient-to-b from-transparent to-black/25" aria-hidden="true" />
      <div className="relative flex min-h-44 flex-wrap items-end gap-x-[3px] gap-y-2 px-6 pb-2">
        {children}
        {children && (Array.isArray(children) ? children.length === 0 : false) ? (
          <p className="py-10 text-sm italic text-[#e9dcc4]/55">No books on this shelf yet.</p>
        ) : null}
      </div>
      {/* shelf plank with wood grain */}
      <div className="relative h-[14px]">
        <div
          className="absolute inset-0 rounded-[2px] border border-black/20 shadow-[0_10px_18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.35)]"
          style={{
            background: `linear-gradient(to bottom, #d4ac74 0%, #b78a4e 22%, #9c6d34 55%, #7a4f1f 100%), repeating-linear-gradient(90deg, rgba(0,0,0,0.07) 0 1px, transparent 1px 7px, rgba(255,255,255,0.06) 7px 8px)`,
            backgroundBlendMode: "multiply",
          }}
          aria-hidden="true"
        />
        {/* top highlight */}
        <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-[2px] bg-gradient-to-b from-white/55 to-transparent" aria-hidden="true" />
        {/* front lip shadow */}
        <div className="absolute inset-x-0 bottom-0 h-[5px] rounded-b-[2px] bg-gradient-to-b from-black/10 to-black/30" aria-hidden="true" />
      </div>
      {/* deep shadow under shelf */}
      <div className="h-5 bg-gradient-to-b from-black/35 via-black/10 to-transparent" aria-hidden="true" />
    </div>
  );
}

/** The empty bookshelf: the options sit in a translucent menu at its centre, shelves still visible behind. */
function EmptyBookshelf({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_50%_-10%,rgba(255,248,220,0.22),transparent_55%),linear-gradient(to_bottom,#6d5232_0%,#60492d_18%,#574129_36%,#4e3a24_62%,#3d2e1c_100%)]" aria-hidden="true" />
      <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 22px, rgba(0,0,0,0.5) 22px 23px)" }} aria-hidden="true" />
      <div className="relative space-y-7 px-3 py-5">
        <Shelf label="Books" />
        <Shelf />
        <Shelf />
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/15 bg-card/90 p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5),0_2px_10px_rgba(0,0,0,0.3)] backdrop-blur-xl">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Library className="size-5" />
          </div>
          <h2 className="font-serif text-xl font-semibold">Your bookshelf is empty</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Start a book from scratch, or bring in a manuscript you already have. Every book you save appears on these shelves.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <Button onClick={onNew}>
              <Plus /> New manuscript
            </Button>
            <Button variant="outline" onClick={onImport}>
              <FileUp /> Import manuscript
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Overlay for importing: stays on the bookshelf, darkens and blurs the shelves behind. */
function ImportDialog({
  workspace,
  onClose,
  onImported,
}: {
  workspace: Workspace;
  onClose: () => void;
  onImported: (id: Id) => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-[#1a1208]/55 p-4 py-8 backdrop-blur-[3px] sm:p-8" onClick={onClose} role="presentation">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-200" role="dialog" aria-modal="true" aria-label="Import a manuscript">
        <ImportManuscriptForm
          workspace={workspace}
          onCancel={onClose}
          onImported={(id) => {
            onImported(id);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

/** The pulled book: its cover presented, and the manuscript's card in a floating card on the cover's right-hand side. */
function BookPresentation({ manuscript, words, seriesTitle }: { manuscript: Manuscript; words: number; seriesTitle?: string }) {
  const { workspace, manuscript: brought, selectManuscript, navigate } = useApp();
  const isBrought = brought?.id === manuscript.id;
  const genre = genreById(manuscript.genre);

  return (
    <div className="shrink-0 border-b border-border/60 bg-gradient-to-b from-card via-card to-muted/30 px-6 pb-8 pt-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <div key={manuscript.id} className="cover-present flex flex-wrap items-end gap-2">
        <div className="relative">
          <div className="absolute -bottom-3 left-4 right-4 h-6 rounded-full bg-black/20 blur-[8px]" aria-hidden="true" />
          <CoverMockup title={manuscript.title} author={workspace?.name ?? ""} genre={genre} image={manuscript.cover} size="lg" />
        </div>
        <Card className="mb-2 ml-5 min-w-0 flex-1 basis-96 space-y-5 border-border/60 bg-card p-5 shadow-xl">
          <div className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{isBrought ? "In the workspace" : "On the shelf"}</p>
            <TitleEditor key={manuscript.id} manuscript={manuscript} />
            <div className="flex flex-wrap gap-2">
              <Button disabled={isBrought} onClick={() => selectManuscript(manuscript.id)}>
                <ArrowRight /> {isBrought ? "In the workspace" : "Bring to workspace"}
              </Button>
              {isBrought ? (
                <Button variant="outline" onClick={() => navigate("roadmap")}>
                  Open the Roadmap
                </Button>
              ) : null}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {isBrought
                ? "The book screens are unlocked. Choose another book on the shelf and bring it to the workspace to switch; your work is saved first."
                : "The book screens stay greyed out until you bring this book to the workspace. Bringing it also saves whatever you were working on before."}
            </p>
          </div>
          <ManuscriptOptions manuscript={manuscript} words={words} seriesTitle={seriesTitle} />
        </Card>
      </div>
    </div>
  );
}

export function Manuscripts() {
  const { workspace, manuscripts, manuscript } = useApp();
  const [pane, setPane] = useState<Pane>("manuscript");
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const needsPenName = !!workspace && !workspace.name.trim();
  const hasBooks = manuscripts.length > 0;

  const wordCounts = useLiveQuery(async () => {
    const counts: Record<Id, number> = {};
    const ids = manuscripts.map((m) => m.id);
    if (ids.length === 0) return counts;
    await db.chapters
      .where("manuscriptId")
      .anyOf(ids)
      .each((chapter) => {
        counts[chapter.manuscriptId] = (counts[chapter.manuscriptId] ?? 0) + chapter.wordCount;
      });
    return counts;
  }, [manuscripts.map((m) => m.id).join(",")]);

  // Series containers are not books, so they are read separately from the shelf.
  const seriesRows = useLiveQuery(
    async () => (workspace ? db.manuscripts.where("workspaceId").equals(workspace.id).filter((m) => m.type === "series").toArray() : []),
    [workspace?.id],
  );
  const series = [...(seriesRows ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const standalone = manuscripts.filter((m) => !m.seriesId);

  // The book chosen on the shelf, or the one in the workspace. Nothing is chosen for you.
  const chosen = manuscripts.find((m) => m.id === selectedId) ?? manuscript ?? null;
  const shown: Pane = pane === "manuscript" && needsPenName && !hasBooks ? "new" : pane;
  const cancel = hasBooks ? () => setPane("manuscript") : null;

  function newBook() {
    setPane("new");
    setSelectedId(null);
  }
  function importBook() {
    // Stay on the bookshelf: open as a dialog over the shelves.
    setImportOpen(true);
  }
  function pick(id: Id) {
    setSelectedId(id);
    setPane("manuscript");
  }

  function shelfArea() {
    return (
      <div className="relative min-h-0 flex-1 overflow-y-auto px-3 pb-10 pt-6">
        {/* warm bookcase wall with vignette light */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_65%_at_50%_-8%,rgba(255,244,214,0.20),transparent_58%),linear-gradient(to_bottom,#6d5232_0%,#60492d_18%,#574129_36%,#4f3c26_62%,#3d2e1c_100%)]" aria-hidden="true" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent 0 24px, rgba(0,0,0,0.7) 24px 25px)" }} aria-hidden="true" />
        <div className="relative space-y-8">
          {standalone.length > 0 ? (
            <Shelf label="Books">
              {standalone.map((m) => (
                <Spine key={m.id} manuscript={m} words={wordCounts?.[m.id] ?? 0} selected={chosen?.id === m.id} brought={manuscript?.id === m.id} onClick={() => pick(m.id)} />
              ))}
            </Shelf>
          ) : hasBooks ? null : (
            <Shelf label="Books">
              <p className="px-2 py-8 text-sm italic text-[#f5e6c8]/60">No standalone books yet — your imported or new books will stand here.</p>
            </Shelf>
          )}
          {series.map((s) => {
            const books = manuscripts
              .filter((m) => m.seriesId === s.id)
              .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
            if (books.length === 0) return null;
            return (
              <Shelf key={s.id} label={`${s.title} — ${books.length} ${books.length === 1 ? "book" : "books"}`}>
                {books.map((m) => (
                  <Spine key={m.id} manuscript={m} words={wordCounts?.[m.id] ?? 0} selected={chosen?.id === m.id} brought={manuscript?.id === m.id} onClick={() => pick(m.id)} />
                ))}
              </Shelf>
            );
          })}
          {hasBooks && standalone.length === 0 && series.length === 0 ? (
            <p className="px-6 text-sm text-[#f5e6c8]/60">Your books will appear on the shelves above.</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Bookshelf"
        description={workspace ? `Every book by ${workspace.name || "this workspace"}.` : "Every book in this workspace."}
        actions={
          <>
            <Button size="sm" variant={shown === "new" ? "secondary" : "outline"} disabled={!workspace} onClick={newBook}>
              <Plus /> New manuscript
            </Button>
            <Button size="sm" variant={importOpen ? "secondary" : "outline"} disabled={!workspace} onClick={importBook}>
              <FileUp /> Import manuscript
            </Button>
            <Button size="sm" variant={shown === "author" ? "secondary" : "outline"} disabled={!workspace} onClick={() => setPane("author")}>
              <UserRound /> About this author
            </Button>
          </>
        }
      />
      {shown === "new" ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <NewManuscriptForm key="new" workspace={workspace!} needsPenName={needsPenName} onCancel={cancel} />
        </div>
      ) : shown === "author" && workspace ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <div className="max-w-xl">
            <WorkspaceForm key={workspace.id} workspace={workspace} />
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPane("manuscript")}>
              Back to the bookshelf
            </Button>
          </div>
        </div>
      ) : !hasBooks ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <EmptyBookshelf onNew={newBook} onImport={importBook} />
          {importOpen && workspace ? (
            <ImportDialog
              workspace={workspace}
              onClose={() => setImportOpen(false)}
              onImported={(id) => {
                setSelectedId(id);
                setPane("manuscript");
              }}
            />
          ) : null}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {chosen ? (
              <BookPresentation key={chosen.id} manuscript={chosen} words={wordCounts?.[chosen.id] ?? 0} seriesTitle={series.find((s) => s.id === chosen.seriesId)?.title} />
            ) : null}
            {shelfArea()}
          </div>
          {importOpen && workspace ? (
            <ImportDialog
              workspace={workspace}
              onClose={() => setImportOpen(false)}
              onImported={(id) => {
                setSelectedId(id);
                setPane("manuscript");
              }}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
