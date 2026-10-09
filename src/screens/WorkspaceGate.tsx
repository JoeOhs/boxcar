import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, BookOpen, Plus } from "lucide-react";
import { db, type Id } from "@/db/schema";
import { createWorkspace } from "@/lib/store";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The first screen. Every outline, draft, edit, format and export lives inside
 * one workspace (an author or pen name), so a workspace is chosen or created
 * here before anything else is shown.
 */
export function WorkspaceGate() {
  const { workspaces, selectWorkspace, navigate } = useApp();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const bookCounts = useLiveQuery(async () => {
    const counts: Record<Id, number> = {};
    await db.manuscripts.each((m) => {
      counts[m.workspaceId] = (counts[m.workspaceId] ?? 0) + 1;
    });
    return counts;
  }, []);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createWorkspace(name);
      setName("");
      navigate("manuscripts");
      selectWorkspace(created.id);
    } finally {
      setBusy(false);
    }
  }

  const hasWorkspaces = workspaces.length > 0;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-muted/40 p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="space-y-2 text-center">
          <BookOpen className="mx-auto size-8" />
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Boxcar Studio</h1>
          <p className="text-sm text-muted-foreground">
            {hasWorkspaces
              ? "Choose the author or pen name you are working as, or create a new workspace."
              : "Start by creating a workspace for an author or pen name. Your manuscripts, outlines and exports live inside it."}
          </p>
        </div>

        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-medium">Create a workspace</h2>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="gate-name">Author or pen name</Label>
              <Input id="gate-name" value={name} autoFocus onChange={(e) => setName(e.target.value)} hint="e.g. Jane Marlowe" />
            </div>
            <Button type="submit" disabled={!name.trim() || busy}>
              <Plus /> Create
            </Button>
          </form>
        </Card>

        {hasWorkspaces ? (
          <Card className="space-y-2 p-5">
            <h2 className="text-sm font-medium">Your workspaces</h2>
            <div className="space-y-1">
              {workspaces.map((w) => {
                const books = bookCounts?.[w.id] ?? 0;
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      navigate("manuscripts");
                      selectWorkspace(w.id);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{w.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {books} {books === 1 ? "manuscript" : "manuscripts"}
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
