import { useState } from "react";
import { Check, RefreshCw, Sparkles } from "lucide-react";
import type { Genre } from "@/lib/genres";
import { generatePenNames } from "@/lib/penNames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CoverMockup } from "@/components/CoverMockup";

const SUGGESTIONS = 5;

/**
 * Pen name choice for a workspace. The author can generate a brief list of pen
 * names that suit the genre, or type their own. Every name, generated or typed,
 * is shown on a cover mockup of the book in the genre's look.
 */
export function PenNamePicker({
  idPrefix,
  title,
  genre,
  currentName,
  onChoose,
}: {
  idPrefix: string;
  /** The book's title, shown on the mockups. */
  title: string;
  genre: Genre | undefined;
  /** The pen name now in use for the workspace, if any. */
  currentName: string;
  onChoose: (name: string) => void | Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const shownName = currentName.trim();
  const typedName = typed.trim();

  async function choose(name: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onChoose(name);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start gap-5">
        <div className="space-y-1">
          <p className="text-sm font-medium">Pen name</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {shownName
              ? `${shownName} is the pen name for this workspace. It goes on the title page and the cover.`
              : "No pen name yet. Generate some, or type your own."}
          </p>
        </div>
        <div className="ml-auto">
          <CoverMockup title={title} author={shownName} genre={genre} size="sm" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSuggestions(generatePenNames(genre, SUGGESTIONS))}
          >
            <Sparkles /> {suggestions.length ? "Suggest again" : "Generate pen names"}
          </Button>
          {suggestions.length ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSuggestions(generatePenNames(genre, SUGGESTIONS, suggestions))}
            >
              <RefreshCw /> Shuffle
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">{genre ? `Suited to ${genre.label.toLowerCase()}` : "Choose a genre for names that suit it"}</span>
        </div>

        {suggestions.length ? (
          <div className="grid gap-2 sm:grid-cols-2" role="list" aria-label="Generated pen names">
            {suggestions.map((name) => {
              const chosen = name.toLowerCase() === shownName.toLowerCase();
              return (
                <div key={name} role="listitem" className="flex items-center gap-3 rounded-md border border-border p-2">
                  <CoverMockup title={title} author={name} genre={genre} size="sm" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant={chosen ? "secondary" : "default"}
                      disabled={chosen || busy}
                      onClick={() => void choose(name)}
                    >
                      {chosen ? (
                        <>
                          <Check /> In use
                        </>
                      ) : (
                        "Use this name"
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <Label htmlFor={`${idPrefix}-typed-pen-name`}>Or type your own pen name</Label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typedName) void choose(typedName).then(() => setTyped(""));
          }}
        >
          <Input
            id={`${idPrefix}-typed-pen-name`}
            value={typed}
            hint="e.g. Jane Marlowe"
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!typedName || busy || typedName === shownName}>
            Use this name
          </Button>
        </form>
        {typedName ? (
          <div className="pt-1">
            <p className="mb-2 text-xs text-muted-foreground">Cover mockup with this name:</p>
            <CoverMockup title={title} author={typedName} genre={genre} size="sm" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
