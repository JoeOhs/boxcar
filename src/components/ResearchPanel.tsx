import { useRef, useState } from "react";
import { BookOpen, FileUp, Link as LinkIcon, Plus, Trash2 } from "lucide-react";
import { type Id, type ResearchNote } from "@/db/schema";
import { IMPORT_ACCEPT } from "@/lib/documents";
import { useResearchNotes } from "@/lib/hooks";
import { createResearchNote, deleteResearchNote, patchResearchNote } from "@/lib/store";
import { importResearchFile } from "@/lib/research";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const KIND_ICON = { note: BookOpen, link: LinkIcon, file: FileUp } as const;

/**
 * The research repository, kept beside the writing desk: notes, web links and imported files
 * about the book. Items marked for the Ghostwriter are given to it as background.
 */
export function ResearchPanel({ manuscriptId }: { manuscriptId: Id }) {
  const notes = useResearchNotes(manuscriptId);
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = notes?.find((n) => n.id === selectedId);

  async function addItem(kind: "note" | "link") {
    setError(null);
    const created = await createResearchNote(manuscriptId, kind, kind === "link" ? "New link" : "New note");
    setSelectedId(created.id);
  }

  async function addFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const created = await importResearchFile(manuscriptId, file);
      setSelectedId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(note: ResearchNote) {
    if (!window.confirm(`Delete "${note.title || "this research"}"?`)) return;
    await deleteResearchNote(note.id);
    setSelectedId(null);
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border" aria-label="Research">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h2 className="font-serif text-sm font-semibold">Research</h2>
        <span className="text-xs text-muted-foreground">{notes?.length ?? 0} items</span>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1 border-b border-border px-3 py-2">
        <Button size="sm" variant="outline" onClick={() => void addItem("note")}>
          <Plus /> Note
        </Button>
        <Button size="sm" variant="outline" onClick={() => void addItem("link")}>
          <LinkIcon /> Link
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <FileUp /> {busy ? "Reading..." : "File"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept={IMPORT_ACCEPT}
          aria-label="Choose a research file"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void addFile(file);
          }}
        />
      </div>
      {error ? <p className="px-4 pt-2 text-xs text-destructive">{error}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {notes === undefined ? null : notes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Keep the facts, places, quotes and links you need while you write. Add a note, a link, or a file (.txt, .md, .html, .docx or .epub).
          </p>
        ) : (
          <ul className="space-y-0.5 p-2">
            {notes.map((note) => {
              const Icon = KIND_ICON[note.kind];
              return (
                <li key={note.id}>
                  <button
                    onClick={() => setSelectedId(note.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      note.id === selectedId ? "bg-accent font-medium" : "hover:bg-accent/50",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{note.title || "Untitled"}</span>
                    <span
                      title={note.shareWithGhostwriter ? "The Ghostwriter can read this" : "Hidden from the Ghostwriter"}
                      className={cn("size-2 shrink-0 rounded-full", note.shareWithGhostwriter ? "bg-primary" : "bg-muted-foreground/40")}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {selected ? <ResearchForm key={selected.id} note={selected} onDelete={() => void remove(selected)} /> : null}
      </div>
    </aside>
  );
}

function ResearchForm({ note, onDelete }: { note: ResearchNote; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [url, setUrl] = useState(note.url);
  const [content, setContent] = useState(note.content);
  const safeLink = /^https?:\/\//i.test(url.trim()) ? url.trim() : "";

  return (
    <div className="space-y-3 border-t border-border p-4">
      <div className="space-y-1">
        <Label htmlFor="r-title">Title</Label>
        <Input
          id="r-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            void patchResearchNote(note.id, { title: e.target.value });
          }}
        />
      </div>
      {note.kind === "link" ? (
        <div className="space-y-1">
          <Label htmlFor="r-url">Web address</Label>
          <Input
            id="r-url"
            value={url}
            hint="https://"
            onChange={(e) => {
              setUrl(e.target.value);
              void patchResearchNote(note.id, { url: e.target.value });
            }}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label htmlFor="r-content">{note.kind === "link" ? "What to remember from it" : "Text"}</Label>
        <Textarea
          id="r-content"
          rows={10}
          value={content}
          hint="Facts, quotes, places, dates..."
          onChange={(e) => {
            setContent(e.target.value);
            void patchResearchNote(note.id, { content: e.target.value });
          }}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={note.shareWithGhostwriter}
          onChange={(e) => void patchResearchNote(note.id, { shareWithGhostwriter: e.target.checked })}
          className="size-4 accent-primary"
        />
        The Ghostwriter can use this
      </label>
      <div className="flex items-center justify-between">
        {safeLink ? (
          <a href={safeLink} target="_blank" rel="noreferrer" className="text-xs underline">
            Open the link
          </a>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}
