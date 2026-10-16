import { useState } from "react";
import { DatabaseBackup, FolderOpen } from "lucide-react";
import {
  createBackup,
  readBackup,
  restoreBackup,
  summarizeBackup,
  summarizeCurrent,
  type BackupFile,
  type BackupSummary,
} from "@/lib/backup";
import { downloadBlob } from "@/lib/download";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function counts(s: Omit<BackupSummary, "savedAt">): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(s.workspaces, "workspace", "workspaces"),
    plural(s.manuscripts, "manuscript", "manuscripts"),
    plural(s.chapters, "chapter", "chapters"),
  ].join(", ");
}

interface Pending {
  backup: BackupFile;
  summary: BackupSummary;
  current: Omit<BackupSummary, "savedAt">;
}

/**
 * "Save a backup" downloads everything the app stores as one JSON file; "Open a backup"
 * reads such a file, says what it holds, and asks before it replaces what is here.
 */
export function BackupControls() {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const { blob, filename } = await createBackup();
      downloadBlob(blob, filename);
      setMessage({ ok: true, text: `Saved ${filename}. Keep it somewhere safe; open it here to bring everything back.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "The backup could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setPending(null);
    try {
      const backup = await readBackup(file);
      setPending({ backup, summary: summarizeBackup(backup), current: await summarizeCurrent() });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "That file could not be opened." });
    }
  }

  async function replace() {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending.backup);
      setMessage({ ok: true, text: `Backup opened. Everything from ${formatDate(pending.summary.savedAt)} is now here.` });
      setPending(null);
    } catch {
      setMessage({ ok: false, text: "The backup could not be opened, so nothing was changed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void save()}>
          <DatabaseBackup /> Save a backup
        </Button>
        <Button asChild variant="outline" size="sm" className={cn(busy && "pointer-events-none opacity-50")}>
          <label className="cursor-pointer">
            <FolderOpen /> Open a backup
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The backup holds your workspaces, manuscripts, outlines, chapters, research and covers. Your AI keys stay on this computer
        and are not put in the file.
      </p>
      {pending ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">This backup was saved {formatDate(pending.summary.savedAt)}.</p>
          <p>It holds {counts(pending.summary)}.</p>
          <p className="text-muted-foreground">
            Opening it replaces what is here now: {counts(pending.current)}. This cannot be undone.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => void replace()}>
              Replace what is here
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {message ? <p className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>{message.text}</p> : null}
    </div>
  );
}
