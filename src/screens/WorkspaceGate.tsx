import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ArrowRight, Plus, Sparkles } from "lucide-react";
import { db, type Id } from "@/db/schema";
import { createWorkspace } from "@/lib/store";
import { useApp } from "@/state/AppState";
import { BackupControls } from "@/components/BackupControls";
import { Brand, ThemeToggle } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type View = "home" | "create";

/**
 * The first screen. Every outline, draft, edit, format and export lives inside
 * one workspace (an author or pen name), so a workspace is chosen or created
 * here before anything else is shown. The two options are "New Workspace" and
 * the workspaces already saved on this computer.
 */
export function WorkspaceGate() {
  const { workspaces, selectWorkspace, navigate } = useApp();
  const [view, setView] = useState<View>("home");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const bookCounts = useLiveQuery(async () => {
    const counts: Record<Id, number> = {};
    await db.manuscripts.each((m) => {
      if (m.type === "series") return;
      counts[m.workspaceId] = (counts[m.workspaceId] ?? 0) + 1;
    });
    return counts;
  }, []);

  /** Opens a workspace on the manuscripts menu. A workspace with no pen name opens the pen name generator there. */
  function open(id: Id) {
    navigate("manuscripts");
    selectWorkspace(id);
  }

  async function create(penName: string) {
    if (busy) return;
    setBusy(true);
    try {
      const created = await createWorkspace(penName);
      setName("");
      open(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex h-full overflow-y-auto bg-muted/40 p-6">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="m-auto w-full max-w-xl space-y-6">
        <div className="space-y-3 text-center">
          <Brand large />
          <p className="text-sm text-muted-foreground">
            {view === "home"
              ? "Start a new workspace for an author or pen name, or open one you have saved on this computer."
              : "Name the author or pen name this workspace is for, or generate one in the next step."}
          </p>
        </div>

        {view === "home" ? (
          <>
            <Button className="h-12 w-full text-base" onClick={() => setView("create")}>
              <Plus /> New Workspace
            </Button>

            <Card className="space-y-2 p-5">
              <h2 className="text-sm font-medium">Saved workspaces</h2>
              {workspaces.length === 0 ? (
                <p className="text-sm text-muted-foreground">No workspaces saved on this computer yet.</p>
              ) : (
                <div className="space-y-1">
                  {workspaces.map((w) => {
                    const books = bookCounts?.[w.id] ?? 0;
                    return (
                      <button
                        key={w.id}
                        onClick={() => open(w.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{w.name || "No pen name yet"}</span>
                          <span className="block text-xs text-muted-foreground">
                            {books} {books === 1 ? "manuscript" : "manuscripts"}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Create workspace</h2>
              <Button variant="ghost" size="sm" onClick={() => setView("home")}>
                <ArrowLeft /> Back
              </Button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) void create(name);
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="gate-name">Author or pen name</Label>
                <Input id="gate-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} hint="e.g. Jane Marlowe" />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" className="flex-1" disabled={!name.trim() || busy}>
                  <Plus /> Create workspace
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => void create("")}
                  title="Opens the pen name generator in the new manuscript menu"
                >
                  <Sparkles /> Generate a pen name
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-medium">Bring your work back</h2>
          <p className="text-xs text-muted-foreground">Open a backup file you saved earlier to restore your workspaces and manuscripts.</p>
          <BackupControls />
        </Card>
      </div>
    </div>
  );
}
