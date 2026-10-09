import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/state/AppState";

/** Shown by every book screen when there is no manuscript to work on yet. */
export function NoManuscript() {
  const { navigate, workspace } = useApp();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <BookOpen className="size-8 text-muted-foreground" />
      <h2 className="font-serif text-xl font-semibold">No manuscript yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {workspace
          ? `Create a manuscript in the ${workspace.name} workspace to start.`
          : "Create a workspace for an author or pen name, then add a manuscript to it."}
      </p>
      <Button onClick={() => navigate("manuscripts")}>Go to Manuscripts</Button>
    </div>
  );
}
