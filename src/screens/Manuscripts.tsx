import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import {
  db,
  deleteManuscript,
  deleteWorkspace,
  type Id,
  type ManuscriptStatus,
  type Workspace,
} from "@/db/schema";
import { createManuscript, patchManuscript, patchWorkspace } from "@/lib/store";
import { useApp } from "@/state/AppState";
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

export function Manuscripts() {
  const { workspace, manuscripts, manuscript, selectManuscript, navigate } = useApp();
  const [newTitle, setNewTitle] = useState("");

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

  async function addManuscript() {
    if (!workspace || !newTitle.trim()) return;
    const created = await createManuscript(workspace, newTitle);
    setNewTitle("");
    selectManuscript(created.id);
    navigate("outline");
  }

  async function removeManuscript(id: Id, title: string) {
    if (!window.confirm(`Delete "${title}" with all its chapters and outline? This cannot be undone.`)) return;
    await deleteManuscript(id);
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Manuscripts"
        description={workspace ? `Every book by ${workspace.name}.` : "Every book in this workspace."}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[20rem_1fr]">
        <section className="space-y-4">
          <h2 className="text-sm font-medium">This workspace</h2>
          {workspace ? <WorkspaceForm key={workspace.id} workspace={workspace} /> : null}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium">Manuscripts</h2>
          {workspace ? (
            <form
              className="flex max-w-md gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addManuscript();
              }}
            >
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} hint="Title of a new manuscript" />
              <Button type="submit" disabled={!newTitle.trim()}>
                <Plus /> Create
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Choose a workspace first, then create manuscripts in it.</p>
          )}

          <div className="grid gap-3 xl:grid-cols-2">
            {manuscripts.map((m) => (
              <Card key={m.id} className={"space-y-3 p-4 " + (m.id === manuscript?.id ? "ring-2 ring-ring/50" : "")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-serif text-lg font-semibold">{m.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {(wordCounts?.[m.id] ?? 0).toLocaleString()} words
                      {m.targetWordCount ? ` of ${m.targetWordCount.toLocaleString()}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete manuscript"
                    onClick={() => void removeManuscript(m.id, m.title)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`status-${m.id}`}>Stage</Label>
                    <Select
                      id={`status-${m.id}`}
                      className="h-8"
                      value={m.status}
                      onChange={(e) => void patchManuscript(m.id, { status: e.target.value as ManuscriptStatus })}
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
                    <TargetInput id={m.id} value={m.targetWordCount} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      selectManuscript(m.id);
                      navigate("outline");
                    }}
                  >
                    Open
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {workspace && manuscripts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No manuscripts in this workspace yet.</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
