import { useState } from "react";
import { Check, Palette, RefreshCw, Sparkles } from "lucide-react";
import type { Genre } from "@/lib/genres";
import { generatePenNames } from "@/lib/penNames";
import { buildCoverPrompt, DEFAULT_COVER_BRIEF, generateCoverImage, IMAGE_PROVIDER_LABEL, useImageAiSettings } from "@/lib/imageAi";
import { useApp } from "@/state/AppState";
import { CoverMockup } from "@/components/CoverMockup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SUGGESTIONS = 5;

/** The prompt for an image-AI cover mockup of one pen name: the title and the name, lettered in the genre's look. */
function mockupPrompt(title: string, penName: string, genre: Genre | undefined): string {
  return buildCoverPrompt({
    title,
    subtitle: "",
    author: penName,
    genre,
    brief: {
      ...DEFAULT_COVER_BRIEF,
      subject: "a single striking image suited to the genre, kept simple so the title and author name read clearly",
      lettering: true,
    },
  });
}

/**
 * Pen name choice for a workspace. The pen name generator needs a genre, so its
 * button stays grey until one is chosen. Every name is shown on a cover mockup:
 * drawn in the genre's look, or, when the author has an image AI key, a picture
 * made by that model. Clicking a mockup zooms it.
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
  const { navigate } = useApp();
  // The author's image key: undefined while loading, null when none is saved.
  const ai = useImageAiSettings();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Cover pictures made by the image AI, keyed by pen name.
  const [pictures, setPictures] = useState<Record<string, Blob>>({});
  const [drawing, setDrawing] = useState<string | null>(null);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const shownName = currentName.trim();
  const typedName = typed.trim();

  function pictureOf(name: string): Blob | undefined {
    return name ? pictures[name] : undefined;
  }

  /** Draws one AI cover mockup per name, one after another. Stops at the first failure. */
  async function draw(names: string[]) {
    if (!ai) return;
    setDrawError(null);
    for (const name of names) {
      setDrawing(name);
      try {
        const image = await generateCoverImage(ai, mockupPrompt(title, name, genre));
        setPictures((previous) => ({ ...previous, [name]: image }));
      } catch (e) {
        setDrawError(e instanceof Error ? e.message : "The cover mockup could not be drawn.");
        break;
      }
    }
    setDrawing(null);
  }

  function generate(again: boolean) {
    if (!genre) return;
    const next = generatePenNames(genre, SUGGESTIONS, again ? suggestions : []);
    setSuggestions(next);
    void draw(next);
  }

  async function choose(name: string) {
    if (busy) return;
    setBusy(true);
    try {
      await onChoose(name);
    } finally {
      setBusy(false);
    }
  }

  const drawingNow = drawing !== null;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start gap-5">
        <div className="space-y-1">
          <p className="text-sm font-medium">Pen name</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {shownName
              ? shownName + " is the pen name for this workspace. It goes on the title page and the cover."
              : "No pen name yet. Choose a genre, then generate some, or type your own."}
          </p>
        </div>
        <div className="ml-auto">
          <CoverMockup title={title} author={shownName} genre={genre} size="sm" image={pictureOf(shownName)} />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={!genre || drawingNow} onClick={() => generate(false)}>
            <Sparkles /> {suggestions.length ? "Suggest again" : "Generate pen names"}
          </Button>
          {suggestions.length ? (
            <Button type="button" size="sm" variant="ghost" disabled={!genre || drawingNow} onClick={() => generate(true)}>
              <RefreshCw /> Shuffle
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {genre ? "Suited to " + genre.label.toLowerCase() : "Choose a genre first. Names are picked to suit it."}
          </span>
        </div>

        {ai ? (
          <p className="text-xs text-muted-foreground">
            Covers are drawn by {IMAGE_PROVIDER_LABEL[ai.provider]} with your image key. Each picture is billed by the provider.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Add an image AI key in Settings to have each cover drawn by AI. The drawn mockups need no key.
            <Button type="button" size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs underline" onClick={() => navigate("settings")}>
              Open Settings
            </Button>
          </p>
        )}
        {drawError ? <p className="text-xs text-destructive">{drawError}</p> : null}

        {suggestions.length ? (
          <div className="grid gap-2 sm:grid-cols-2" role="list" aria-label="Generated pen names">
            {suggestions.map((name) => {
              const chosen = name.toLowerCase() === shownName.toLowerCase();
              const waiting = drawing === name;
              return (
                <div key={name} role="listitem" className="flex items-center gap-3 rounded-md border border-border p-2">
                  <CoverMockup title={title} author={name} genre={genre} size="sm" image={pictureOf(name)} />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {waiting ? <p className="text-xs text-muted-foreground">Drawing the cover...</p> : null}
                    <div className="flex flex-wrap gap-1.5">
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
                      {ai && !pictureOf(name) && !waiting ? (
                        <Button type="button" size="sm" variant="ghost" disabled={drawingNow} onClick={() => void draw([name])}>
                          <Palette /> Draw cover
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <Label htmlFor={idPrefix + "-typed-pen-name"}>Or type your own pen name</Label>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (typedName) void choose(typedName).then(() => setTyped(""));
          }}
        >
          <Input
            id={idPrefix + "-typed-pen-name"}
            value={typed}
            hint="e.g. Jane Marlowe"
            onChange={(e) => setTyped(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!typedName || busy || typedName === shownName}>
            Use this name
          </Button>
        </form>
        {typedName ? (
          <div className="flex flex-wrap items-end gap-3 pt-1">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Cover mockup with this name:</p>
              <CoverMockup title={title} author={typedName} genre={genre} size="sm" image={pictureOf(typedName)} />
            </div>
            {ai && !pictureOf(typedName) ? (
              <Button type="button" size="sm" variant="outline" disabled={drawingNow} onClick={() => void draw([typedName])}>
                <Palette /> {drawing === typedName ? "Drawing the cover..." : "Draw cover with AI"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
