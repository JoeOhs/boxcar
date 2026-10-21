import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { FileUp, Plus, Trash2, UserRound } from "lucide-react";
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
import { IMPORT_ACCEPT } from "@/lib/documents";
import { genreById } from "@/lib/genres";
import { importManuscript, planImport, type ImportPlan } from "@/lib/importManuscript";
import { addSeriesBookTo, createManuscript, createSeries, goalWordCount, patchManuscript, patchWorkspace } from "@/lib/store";
import { countWords } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { BlendPicker, GenrePicker } from "@/components/GenrePicker";
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

type Pane = "manuscript" | "new" | "import" | "author";

/**
 * The form for a new manuscript: a title, the type (short story, novella, novel
 * or series), the genre guide, and the pen name. The pen name generator is part of
 * this form, so the pen name suggestions depend on the genre chosen here.
 *
 * Layout: Title beside Type; under Title the Genre dropdown, under Type the
 * Fiction / Non-fiction buttons; the genre guide and the pen name below.
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
  const [startOutline, setStartOutline] = useState(true);
  const [busy, setBusy] = useState(false);
  const genre = genreById(genreId);
  const info = BOOK_TYPES[type];
  // The word-count goal follows the genre chosen here, and is locked in when the book is created.
  const goalWords = goalWordCount(genre, type);

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      if (type === "series") {
        const { books } = await createSeries(workspace, title, bookCount, genre, startOutline && !!genre);
        selectManuscript(books[0].id);
      } else {
        const created = await createManuscript(workspace, title, genre, startOutline && !!genre, type);
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
        <div className="space-y-1 sm:col-span-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-sm">
            <span className="font-medium">Word-count goal:</span>{" "}
            {type === "series" ? `${goalWords.toLocaleString()} words per book` : `${goalWords.toLocaleString()} words`}
            <span className="text-muted-foreground">
              {" "}
              {genre ? `(from the ${genre.label.toLowerCase()} guide)` : "(the default for this type)"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">Set when the book is created. It cannot be changed afterwards.</p>
        </div>
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
            Each book is made as Book 1, Book 2 and so on. Choose the book to outline from the Outline screen.
          </p>
        </div>
      ) : null}

      {genre ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={startOutline} onChange={(e) => setStartOutline(e.target.checked)} />
          <span>
            Start the outline with the {genre.label.toLowerCase()} structure
            <span className="block text-xs text-muted-foreground">
              Also sets a target of {genre.targetWords.toLocaleString()} words and the genre's keywords. You can change both later.
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

/** Brings a manuscript in from a file: .txt, .md, .html, .docx or .epub. It is cut into chapters, which the author can check first. */
function ImportManuscriptForm({ workspace, onCancel }: { workspace: Workspace; onCancel: (() => void) | null }) {
  const { selectManuscript, navigate } = useApp();
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const created = await importManuscript(workspace, plan, title.trim());
      selectManuscript(created.id);
      navigate("roadmap");
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
          <div className="space-y-1">
            <Label htmlFor="import-title">Title</Label>
            <Input id="import-title" value={title} onChange={(e) => setTitle(e.target.value)} />
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

/** The options of the manuscript chosen in the list. */
function ManuscriptOptions({ manuscript, words, seriesTitle }: { manuscript: Manuscript; words: number; seriesTitle?: string }) {
  const { navigate, selectManuscript } = useApp();
  const type = bookTypeOf(manuscript);

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
    <Card className="max-w-2xl space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-xl font-semibold">{manuscript.title}</h2>
          <p className="text-xs text-muted-foreground">
            {BOOK_TYPES[type].label}
            {seriesTitle && manuscript.volumeNumber ? ` - Book ${manuscript.volumeNumber} of ${seriesTitle}` : ""}
            {" - "}
            {words.toLocaleString()} words
            {manuscript.targetWordCount ? ` of ${manuscript.targetWordCount.toLocaleString()}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => navigate("roadmap")}>
            Open
          </Button>
          <Button variant="ghost" size="icon" title="Delete manuscript" onClick={() => void remove()}>
            <Trash2 />
          </Button>
        </div>
      </div>
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
          The genre and book type are set when the book is created and stay as they are. Blending in a second genre is the one change allowed later.
        </p>
      </div>
    </Card>
  );
}

export function Manuscripts() {
  const { workspace, manuscripts, manuscript, selectManuscript } = useApp();
  const [pane, setPane] = useState<Pane>("manuscript");
  // A workspace with no pen name yet opens on the pen name generator in the new manuscript menu.
  // With no manuscript to show, the right-hand side offers to create one.
  const needsPenName = !!workspace && !workspace.name.trim();
  const shown: Pane = pane === "manuscript" && (!manuscript || needsPenName) ? "new" : pane;

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

  // Series containers are not books, so they are read separately from the list of books.
  const seriesRows = useLiveQuery(
    async () => (workspace ? db.manuscripts.where("workspaceId").equals(workspace.id).filter((m) => m.type === "series").toArray() : []),
    [workspace?.id],
  );
  const series = [...(seriesRows ?? [])].sort((a, b) => a.title.localeCompare(b.title));
  const standalone = manuscripts.filter((m) => !m.seriesId);

  function bookButton(m: Manuscript, indent: boolean) {
    const active = shown === "manuscript" && m.id === manuscript?.id;
    const genre = genreById(m.genre);
    const blend = genreById(m.blendGenre);
    const label = indent && m.volumeNumber ? `Book ${m.volumeNumber}` : m.title;
    return (
      <button
        key={m.id}
        onClick={() => {
          selectManuscript(m.id);
          setPane("manuscript");
        }}
        aria-current={active ? "true" : undefined}
        className={cn(
          "w-full rounded-md px-3 py-2 text-left transition-colors",
          indent && "ml-3 w-[calc(100%-0.75rem)] py-1.5",
          active ? "bg-accent" : "hover:bg-accent/50",
        )}
      >
        <span className={cn("block truncate font-serif text-sm font-semibold", indent && "font-sans text-xs font-medium")}>{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {(wordCounts?.[m.id] ?? 0).toLocaleString()} words - {STATUS_LABEL[m.status]}
          {genre ? ` - ${genre.label}` : ""}
          {blend ? ` / ${blend.label}` : ""}
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Manuscripts"
        description={workspace ? `Every book by ${workspace.name || "this workspace"}.` : "Every book in this workspace."}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="space-y-2 border-b border-border p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {workspace ? `${workspace.name || "This workspace"}'s manuscripts` : "Manuscripts"}
            </p>
            <Button size="sm" className="w-full" disabled={!workspace} onClick={() => setPane("new")}>
              <Plus /> New manuscript
            </Button>
            <Button size="sm" variant="outline" className="w-full" disabled={!workspace} onClick={() => setPane("import")}>
              <FileUp /> Import manuscript
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {manuscripts.length === 0 && series.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No manuscripts in this workspace yet.</p>
            ) : null}
            {standalone.map((m) => bookButton(m, false))}
            {series.map((s) => {
              const books = manuscripts
                .filter((m) => m.seriesId === s.id)
                .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
              return (
                <div key={s.id} className="space-y-0.5 pt-2">
                  <p className="px-3 font-serif text-sm font-semibold">{s.title}</p>
                  <p className="px-3 pb-1 text-xs text-muted-foreground">
                    Series - {books.length} {books.length === 1 ? "book" : "books"}
                  </p>
                  {books.map((m) => bookButton(m, true))}
                </div>
              );
            })}
          </div>
          <div className="border-t border-border p-2">
            <button
              onClick={() => setPane("author")}
              aria-current={shown === "author" ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors [&_svg]:size-4",
                shown === "author" ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <UserRound /> About this author
            </button>
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          {!workspace ? (
            <p className="text-sm text-muted-foreground">Choose a workspace first, then create manuscripts in it.</p>
          ) : shown === "new" ? (
            <NewManuscriptForm
              key="new"
              workspace={workspace}
              needsPenName={needsPenName}
              onCancel={manuscript ? () => setPane("manuscript") : null}
            />
          ) : shown === "import" ? (
            <ImportManuscriptForm key="import" workspace={workspace} onCancel={manuscript ? () => setPane("manuscript") : null} />
          ) : shown === "author" ? (
            <div className="max-w-xl">
              <WorkspaceForm key={workspace.id} workspace={workspace} />
            </div>
          ) : manuscript ? (
            <ManuscriptOptions
              key={manuscript.id}
              manuscript={manuscript}
              words={wordCounts?.[manuscript.id] ?? 0}
              seriesTitle={series.find((s) => s.id === manuscript.seriesId)?.title}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}
