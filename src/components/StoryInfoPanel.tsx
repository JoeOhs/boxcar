import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Id, StoryEntry, StoryEntryKind } from "@/db/schema";
import {
  createStoryEntry,
  deleteStoryEntry,
  patchStoryEntry,
  STORY_KIND_LABEL,
  STORY_KIND_PLURAL,
  STORY_KINDS,
  useStoryEntries,
} from "@/lib/storyInfo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** The editor for one character, location or situation. Changes are saved as the author types. */
function EntryEditor({ entry, onDelete }: { entry: StoryEntry; onDelete: () => void }) {
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="story-name">Name</Label>
        <Input
          id="story-name"
          value={name}
          hint={STORY_KIND_LABEL[entry.kind] + " name"}
          onChange={(e) => {
            setName(e.target.value);
            void patchStoryEntry(entry.id, { name: e.target.value });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="story-description">Details</Label>
        <Textarea
          id="story-description"
          rows={6}
          value={description}
          hint="Who they are, what this place is like, what is happening."
          onChange={(e) => {
            setDescription(e.target.value);
            void patchStoryEntry(entry.id, { description: e.target.value });
          }}
        />
      </div>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
        <Trash2 /> Delete
      </Button>
    </div>
  );
}

/**
 * The story info panel, opened on the right of the Outline. It keeps the book's
 * characters, locations and situations, which the outliner AI reads as well.
 */
export function StoryInfoPanel({ manuscriptId }: { manuscriptId: Id }) {
  const entries = useStoryEntries(manuscriptId);
  const [kind, setKind] = useState<StoryEntryKind>("character");
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const shown = (entries ?? []).filter((e) => e.kind === kind);
  const selected = shown.find((e) => e.id === selectedId);

  function pickKind(next: StoryEntryKind) {
    setKind(next);
    setSelectedId(null);
  }

  async function add() {
    const entry = await createStoryEntry(manuscriptId, kind);
    setSelectedId(entry.id);
  }

  async function remove(entry: StoryEntry) {
    if (!window.confirm("Delete " + (entry.name.trim() || "this entry") + "?")) return;
    await deleteStoryEntry(entry.id);
    setSelectedId(null);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border p-4">
        <div>
          <p className="font-serif text-base font-semibold">Story info</p>
          <p className="text-xs text-muted-foreground">Characters, places and situations for this book. The outliner reads them too.</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-md border border-input p-0.5" role="tablist" aria-label="Kind of story info">
          {STORY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => pickKind(k)}
              className={cn(
                "rounded px-2 py-1 text-xs transition-colors",
                kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {STORY_KIND_PLURAL[k]} ({(entries ?? []).filter((e) => e.kind === k).length})
            </button>
          ))}
        </div>
        <Button size="sm" className="w-full" onClick={() => void add()}>
          <Plus /> Add {STORY_KIND_LABEL[kind].toLowerCase()}
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        {entries === undefined ? null : shown.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">No {STORY_KIND_PLURAL[kind].toLowerCase()} yet.</p>
        ) : (
          shown.map((e) => (
            <button
              key={e.id}
              onClick={() => setSelectedId(e.id)}
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                e.id === selectedId ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span className={cn("block truncate font-medium", !e.name.trim() && "text-muted-foreground")}>
                {e.name.trim() || "Unnamed"}
              </span>
              {e.description.trim() ? <span className="block truncate text-xs text-muted-foreground">{e.description.trim()}</span> : null}
            </button>
          ))
        )}
      </div>

      {selected ? (
        <div className="border-t border-border p-4">
          <EntryEditor key={selected.id} entry={selected} onDelete={() => void remove(selected)} />
        </div>
      ) : null}
    </div>
  );
}
