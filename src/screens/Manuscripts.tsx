import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2, UserRound } from "lucide-react";
import {
  db,
  deleteManuscript,
  deleteWorkspace,
  type Id,
  type Manuscript,
  type ManuscriptStatus,
  type Workspace,
} from "@/db/schema";
import { genreById } from "@/lib/genres";
import { createManuscript, patchManuscript, patchWorkspace } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { GenrePicker } from "@/components/GenrePicker";
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

function WorkspaceForm({ workspace }: { workspace: Workspace }) {
  const [name, setName] = useState(workspace.name);
  const [bio, setBio] = useState(workspace.bio);
  const { workspaces, selectWorkspace } = useApp();

  async function remove() {
    if (!window.confirm(`Delete ${workspace.name} and every manuscript in it? This cannot be undone.`)) return;
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
            if (e.target.value.trim()) void patchWorkspace(workspace.id, { name: e.target.value.trim() });
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

function TargetInput({ id, value }: { id: Id; value: number }) {
  const [text, setText] = useState(value ? String(value) : "");
  return (
    <Input
      type="number"
      min={0}
      step={1000}
      className="h-8 w-28"
      hint="None"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        void patchManuscript(id, { targetWordCount: Math.max(0, Math.floor(Number(e.target.value) || 0)) });
      }}
    />
  );
}

type Pane = "manuscript" | "new" | "author";

/** The form for a new manuscript: a title and the genre guide. */
function NewManuscriptForm({ workspace, onCancel }: { workspace: Workspace; onCancel: (() => void) | null }) {
  const { selectManuscript, navigate } = useApp();
  const [title, setTitle] = useState("");
  const [genreId, setGenreId] = useState<string | undefined>(undefined);
  const [startOutline, setStartOutline] = useState(true);
  const [busy, setBusy] = useState(false);
  const genre = genreById(genreId);

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createManuscript(workspace, title, genre, startOutline);
      selectManuscript(created.id);
      navigate("outline");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <h2 className="font-serif text-lg font-semibold">New manuscript</h2>
      <div className="space-y-1">
        <Label htmlFor="new-title">Title</Label>
        <Input id="new-title" value={title} autoFocus hint="Working title is fine" onChange={(e) => setTitle(e.target.value)} />
      </div>
      <GenrePicker idPrefix="new" value={genreId} onChange={setGenreId} />
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
      <div className="flex gap-2">
        <Button disabled={!title.trim() || busy} onClick={() => void create()}>
          <Plus /> Create manuscript
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
function ManuscriptOptions({ manuscript, words }: { manuscript: Manuscript; words: number }) {
  const { navigate } = useApp();

  async function remove() {
    if (!window.confirm(`Delete "${manuscript.title}" with all its chapters and outline? This cannot be undone.`)) return;
    await deleteManuscript(manuscript.id);
  }

  return (
    <Card className="max-w-2xl space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-xl font-semibold">{manuscript.title}</h2>
          <p className="text-xs text-muted-foreground">
            {words.toLocaleString()} words
            {manuscript.targetWordCount ? ` of ${manuscript.targetWordCount.toLocaleString()}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => navigate("outline")}>
            Open
          </Button>
          <Button variant="ghost" size="icon" title="Delete manuscript" onClick={() => void remove()}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid max-w-md grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="status">Stage</Label>
          <Select
            id="status"
            className="h-8"
            value={manuscript.status}
            onChange={(e) => void patchManuscript(manuscript.id, { status: e.target.value as ManuscriptStatus })}
          >
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Target words</Label>
          <TargetInput id={manuscript.id} value={manuscript.targetWordCount} />
        </div>
      </div>
      <GenrePicker
        key={manuscript.id}
        idPrefix="options"
        value={manuscript.genre}
        onChange={(genreId) => void patchManuscript(manuscript.id, { genre: genreId })}
      />
    </Card>
  );
}

export function Manuscripts() {
  const { workspace, manuscripts, manuscript, selectManuscript } = useApp();
  const [pane, setPane] = useState<Pane>("manuscript");
  // With no manuscript to show, the right-hand side offers to create one.
  const shown: Pane = pane === "manuscript" && !manuscript ? "new" : pane;

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

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Manuscripts"
        description={workspace ? `Every book by ${workspace.name}.` : "Every book in this workspace."}
      />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="space-y-2 border-b border-border p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {workspace ? `${workspace.name}'s manuscripts` : "Manuscripts"}
            </p>
            <Button size="sm" className="w-full" disabled={!workspace} onClick={() => setPane("new")}>
              <Plus /> New manuscript
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
            {manuscripts.length === 0 ? (
              <p className="p-2 text-sm text-muted-foreground">No manuscripts in this workspace yet.</p>
            ) : null}
            {manuscripts.map((m) => {
              const active = shown === "manuscript" && m.id === manuscript?.id;
              const genre = genreById(m.genre);
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
                    active ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="block truncate font-serif text-sm font-semibold">{m.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {(wordCounts?.[m.id] ?? 0).toLocaleString()} words - {STATUS_LABEL[m.status]}
                    {genre ? ` - ${genre.label}` : ""}
                  </span>
                </button>
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
              onCancel={manuscript ? () => setPane("manuscript") : null}
            />
          ) : shown === "author" ? (
            <div className="max-w-xl">
              <WorkspaceForm key={workspace.id} workspace={workspace} />
            </div>
          ) : manuscript ? (
            <ManuscriptOptions key={manuscript.id} manuscript={manuscript} words={wordCounts?.[manuscript.id] ?? 0} />
          ) : null}
        </section>
      </div>
    </div>
  );
}