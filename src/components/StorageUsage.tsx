import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { HardDrive } from "lucide-react";
import { db, type Manuscript } from "@/db/schema";
import {
  bookStorage,
  clearBookChats,
  clearCoverConcepts,
  formatBytes,
  REVISIONS_TO_KEEP,
  storageEstimate,
  trimRevisions,
  type BookStorage,
} from "@/lib/storage";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** One book's history sizes, with buttons to clear each kind. Nothing is deleted without a confirmation. */
function BookRow({ manuscript, usage, onDone }: { manuscript: Manuscript; usage: BookStorage; onDone: (text: string) => void }) {
  const title = manuscript.title || "Untitled";

  async function trim() {
    if (!window.confirm(`Keep only the latest ${REVISIONS_TO_KEEP} revisions of each chapter in "${title}"? Older revisions are deleted for good.`)) return;
    const n = await trimRevisions(manuscript.id);
    onDone(n ? `Deleted ${n} older revision${n === 1 ? "" : "s"} from "${title}".` : `"${title}" had nothing older to delete.`);
  }
  async function chats() {
    if (!window.confirm(`Clear every AI conversation for "${title}" (editors, outliner, ghostwriter)? Notes and suggestions are kept.`)) return;
    const n = await clearBookChats(manuscript.id);
    onDone(`Cleared ${n} message${n === 1 ? "" : "s"} from "${title}".`);
  }
  async function covers() {
    if (!window.confirm(`Delete the cover concepts for "${title}"? The cover you chose is kept.`)) return;
    const n = await clearCoverConcepts(manuscript.id);
    onDone(`Deleted ${n} cover concept${n === 1 ? "" : "s"} from "${title}".`);
  }

  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-serif text-sm font-semibold">{title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(usage.totalBytes)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 text-sm">
        <span className="text-muted-foreground">Revisions: {usage.revisions.count}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(usage.revisions.bytes)}</span>
        <Button size="sm" variant="outline" disabled={usage.revisions.count <= REVISIONS_TO_KEEP} onClick={trim}>
          Keep latest {REVISIONS_TO_KEEP} per chapter
        </Button>
        <span className="text-muted-foreground">AI chat messages: {usage.messages.count}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(usage.messages.bytes)}</span>
        <Button size="sm" variant="outline" disabled={usage.messages.count === 0} onClick={chats}>
          Clear chats
        </Button>
        <span className="text-muted-foreground">Cover concepts: {usage.covers.count}</span>
        <span className="text-xs text-muted-foreground">{formatBytes(usage.covers.bytes)}</span>
        <Button size="sm" variant="outline" disabled={usage.covers.count === 0} onClick={covers}>
          Delete concepts
        </Button>
      </div>
    </li>
  );
}

/** The Storage card in Settings (F14): what each book's history takes up, and author-chosen clean-up. */
export function StorageUsage() {
  const { workspace, manuscripts } = useApp();
  const [note, setNote] = useState<string | null>(null);
  // Re-reads whenever revisions, chats or concepts change, so the numbers stay current.
  const usage = useLiveQuery(
    async () => {
      await Promise.all([db.revisions.count(), db.agentMessages.count(), db.coverConcepts.count()]);
      return Promise.all(manuscripts.map((m) => bookStorage(m.id)));
    },
    [manuscripts],
  );
  const estimate = useLiveQuery(() => storageEstimate(), []);

  return (
    <Card className="max-w-xl space-y-3 p-5">
      <div className="flex items-center gap-2">
        <HardDrive className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Storage</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Revision snapshots, AI conversations and cover concepts are kept until you clear them. Nothing here is deleted
        automatically. Chapters, notes and the chosen cover are never touched.
        {estimate ? ` The app uses ${formatBytes(estimate.usage)} of the ${formatBytes(estimate.quota)} this computer allows it.` : ""}
      </p>
      {manuscripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No books in {workspace?.name || "this workspace"} yet.</p>
      ) : (
        <ul className="space-y-2">
          {manuscripts.map((m, i) => (usage?.[i] ? <BookRow key={m.id} manuscript={m} usage={usage[i]} onDone={setNote} /> : null))}
        </ul>
      )}
      {note ? <p className="text-sm text-success">{note}</p> : null}
    </Card>
  );
}
