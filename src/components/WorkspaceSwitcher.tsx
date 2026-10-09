import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, FolderOpen, Plus } from "lucide-react";
import { createWorkspace } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The "Workspaces" button at the bottom of the left menu. It opens a small
 * panel to pick another workspace or add a new one.
 */
export function WorkspaceSwitcher() {
  const { workspaces, workspace, selectWorkspace, navigate } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(id: string) {
    setOpen(false);
    if (id !== workspace?.id) {
      navigate("manuscripts");
      selectWorkspace(id);
    }
  }

  async function add() {
    if (!name.trim()) return;
    const created = await createWorkspace(name);
    setName("");
    setOpen(false);
    navigate("manuscripts");
    selectWorkspace(created.id);
  }

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-2 space-y-2 rounded-lg border border-border bg-card p-2 shadow-lg">
          <p className="px-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Switch workspace</p>
          <div className="max-h-48 space-y-0.5 overflow-y-auto">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => pick(w.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  w.id === workspace?.id && "font-medium",
                )}
              >
                <span className="min-w-0 truncate">{w.name}</span>
                {w.id === workspace?.id ? <Check className="size-4 shrink-0" /> : null}
              </button>
            ))}
          </div>
          <form
            className="flex gap-1.5 border-t border-border pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} hint="New workspace name" className="h-8" />
            <Button type="submit" size="icon" title="Add workspace" disabled={!name.trim()}>
              <Plus />
            </Button>
          </form>
        </div>
      ) : null}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground [&_svg]:size-4"
      >
        <FolderOpen />
        <span className="flex-1 text-left">Workspaces</span>
        <ChevronUp className={cn("transition-transform", open ? "rotate-180" : "")} />
      </button>
    </div>
  );
}
