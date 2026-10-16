import { useRef, useState } from "react";
import { FileUp, Layers } from "lucide-react";
import type { Id } from "@/db/schema";
import { IMPORT_ACCEPT, readDocument } from "@/lib/documents";
import { OUTLINE_FRAMEWORKS, frameworkById } from "@/lib/outlineFrameworks";
import { readOutline } from "@/lib/outlineImport";
import { addOutlineTree } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * Adds an outline to the manuscript's existing one: a story or book structure from the
 * framework list, or the structure already in a file (headings and lists). Nothing is removed.
 */
export function OutlineImport({ manuscriptId, onDone }: { manuscriptId: Id; onDone: (message: string) => void }) {
  const [frameworkId, setFrameworkId] = useState(OUTLINE_FRAMEWORKS[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFramework() {
    const framework = frameworkById(frameworkId);
    if (!framework) return;
    setError(null);
    const added = await addOutlineTree(manuscriptId, framework.nodes);
    onDone(`Added the ${framework.label} structure (${added} items).`);
  }

  async function importFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const { nodes } = readOutline(await readDocument(file));
      const added = await addOutlineTree(manuscriptId, nodes);
      onDone(`Imported ${added} outline items from ${file.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4 border-b border-border bg-muted/40 px-6 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="outline-framework">
            <Layers className="mr-1 inline size-3.5" /> Story or book structure
          </Label>
          <div className="flex gap-2">
            <Select id="outline-framework" value={frameworkId} onChange={(e) => setFrameworkId(e.target.value)}>
              <optgroup label="Fiction">
                {OUTLINE_FRAMEWORKS.filter((f) => f.category === "fiction").map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Non-fiction">
                {OUTLINE_FRAMEWORKS.filter((f) => f.category === "nonfiction").map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </Select>
            <Button size="sm" variant="outline" onClick={() => void addFramework()}>
              Add
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{frameworkById(frameworkId)?.description}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="outline-file">
            <FileUp className="mr-1 inline size-3.5" /> Import from a file
          </Label>
          <div>
            <input
              id="outline-file"
              ref={fileRef}
              type="file"
              accept={IMPORT_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileUp /> {busy ? "Reading..." : "Choose a file"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Reads chapter headings (Chapter 1, # Heading), nested headings and bulleted or numbered lists from a .txt, .md, .html, .docx or .epub file. The first paragraph under a heading becomes its summary.
          </p>
        </div>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
