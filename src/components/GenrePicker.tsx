import { useState } from "react";
import { CATEGORY_LABEL, genreById, genresIn, type Genre, type GenreCategory } from "@/lib/genres";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/** What the genre guide says about one genre: length, outline structure, conventions and keywords. */
export function GenreGuide({ genre }: { genre: Genre }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
      <div>
        <p className="font-medium">{genre.label}</p>
        <p className="text-muted-foreground">{genre.summary}</p>
      </div>
      <p>
        <span className="font-medium">Typical length:</span> {genre.lengthNote}
      </p>
      <div>
        <p className="mb-1 font-medium">Suggested structure</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-muted-foreground">
          {genre.structure.map((section) => (
            <li key={section.title}>{section.title}</li>
          ))}
        </ol>
      </div>
      <div>
        <p className="mb-1 font-medium">What readers expect</p>
        <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
          {genre.conventions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted-foreground">Keywords: {genre.keywords.join(", ")}</p>
    </div>
  );
}

/**
 * The genre menu: a Genre dropdown and the Fiction / Non-fiction buttons, then the
 * guide for the chosen genre. It returns cells, not a box, so the caller lays them
 * out in its own two-column grid (the Genre dropdown sits under the Title field and
 * the buttons under the Type dropdown). The guide spans both columns.
 */
export function GenrePicker({
  value,
  onChange,
  idPrefix,
}: {
  /** Id of the chosen genre, or undefined for none. */
  value: string | undefined;
  onChange: (genreId: string | undefined) => void;
  idPrefix: string;
}) {
  const chosen = genreById(value);
  const [category, setCategory] = useState<GenreCategory>(chosen?.category ?? "fiction");
  const matching = chosen && chosen.category === category ? chosen : undefined;

  function pickCategory(next: GenreCategory) {
    setCategory(next);
    if (chosen && chosen.category !== next) onChange(undefined);
  }

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={idPrefix + "-genre"}>Genre</Label>
        <Select id={idPrefix + "-genre"} value={matching ? matching.id : ""} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">No genre yet</option>
          {genresIn(category).map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        {/* An empty label keeps the buttons level with the Genre dropdown beside them. */}
        <Label aria-hidden="true" className="invisible">
          &nbsp;
        </Label>
        <div className="flex h-9 rounded-md border border-input p-0.5" role="group" aria-label="Fiction or non-fiction">
          {(Object.keys(CATEGORY_LABEL) as GenreCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => pickCategory(c)}
              className={cn(
                "flex-1 whitespace-nowrap rounded px-2 text-sm transition-colors",
                category === c ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
              )}
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      {matching ? (
        <div className="sm:col-span-2">
          <GenreGuide genre={matching} />
        </div>
      ) : null}
    </>
  );
}
