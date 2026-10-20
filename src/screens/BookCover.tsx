import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Download, ImageOff, KeyRound, Sparkles, Trash2, WifiOff } from "lucide-react";
import { db, newId, type CoverBrief, type CoverConcept, type Manuscript } from "@/db/schema";
import { downloadBlob, fileSafeName } from "@/lib/download";
import { genreById } from "@/lib/genres";
import { useOnline } from "@/lib/hooks";
import {
  buildCoverPrompt,
  COVER_STYLES,
  DEFAULT_COVER_BRIEF,
  generateCoverImage,
  IMAGE_PROVIDER_LABEL,
  useImageAiSettings,
} from "@/lib/imageAi";
import { patchManuscript, patchWorkspace } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { CoverImage, CoverMockup } from "@/components/CoverMockup";
import { NoManuscript } from "@/components/NoManuscript";
import { PenNamePicker } from "@/components/PenNamePicker";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function ConceptCard({ concept, manuscript, isCover }: { concept: CoverConcept; manuscript: Manuscript; isCover: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false);

  async function useAsCover() {
    await patchManuscript(manuscript.id, { cover: concept.image });
  }

  return (
    <Card className={cn("space-y-3 overflow-hidden p-3", isCover && "ring-2 ring-ring/50")}>
      <div className="flex justify-center">
        <CoverImage image={concept.image} alt="Cover concept" className="max-h-80 rounded border border-border" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={isCover ? "secondary" : "default"} disabled={isCover} onClick={() => void useAsCover()}>
          {isCover ? (
            <>
              <Check /> This is the cover
            </>
          ) : (
            "Use as cover"
          )}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Download"
          onClick={() => {
            const extension = concept.image.type === "image/jpeg" ? "jpg" : "png";
            downloadBlob(concept.image, fileSafeName(manuscript.title) + "-cover." + extension);
          }}
        >
          <Download />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Delete this concept"
          onClick={() => {
            if (window.confirm("Delete this cover concept?")) void db.coverConcepts.delete(concept.id);
          }}
        >
          <Trash2 />
        </Button>
        <button className="ml-auto text-xs text-muted-foreground underline" onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? "Hide prompt" : "Show prompt"}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {IMAGE_PROVIDER_LABEL[concept.provider]} {concept.model} - {formatDate(concept.createdAt)}
      </p>
      {showPrompt ? <p className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">{concept.prompt}</p> : null}
    </Card>
  );
}

function BookCoverBody({ manuscript }: { manuscript: Manuscript }) {
  const { workspace, navigate } = useApp();
  const online = useOnline();
  const ai = useImageAiSettings();
  const [brief, setBrief] = useState<CoverBrief>(manuscript.coverBrief ?? DEFAULT_COVER_BRIEF);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const concepts = useLiveQuery(
    async () => {
      const rows = await db.coverConcepts.where("manuscriptId").equals(manuscript.id).toArray();
      return rows.sort((a, b) => b.createdAt - a.createdAt);
    },
    [manuscript.id],
  );

  const genre = genreById(manuscript.genre);
  const author = workspace?.name ?? "";
  const prompt = buildCoverPrompt({ title: manuscript.title, subtitle: manuscript.subtitle, author, genre, brief });

  function update(changes: Partial<CoverBrief>) {
    const next = { ...brief, ...changes };
    setBrief(next);
    void patchManuscript(manuscript.id, { coverBrief: next });
  }

  async function generate() {
    if (!ai || busy) return;
    setError(null);
    try {
      for (let i = 1; i <= count; i++) {
        setBusy(count > 1 ? "Making picture " + i + " of " + count + "..." : "Making your cover picture...");
        const image = await generateCoverImage(ai, prompt);
        await db.coverConcepts.add({
          id: newId(),
          manuscriptId: manuscript.id,
          prompt,
          provider: ai.provider,
          model: ai.model.trim() || "default",
          image,
          createdAt: Date.now(),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The cover picture could not be made.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Book Cover"
        description={"Design the cover of " + manuscript.title + " with image-generating AI."}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[24rem_1fr]">
        <section className="space-y-4">
          {ai === null ? (
            <Card className="space-y-3 border-warning/50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4" /> An image AI key is needed
              </div>
              <p className="text-sm text-muted-foreground">
                The cover workshop makes pictures with an image-generating model, such as OpenAI's or Google's. Add a key
                from one of those providers to begin.
              </p>
              <Button size="sm" onClick={() => navigate("settings")}>
                Add it in Settings
              </Button>
            </Card>
          ) : null}

          <Card className="space-y-4 p-4">
            <h2 className="text-sm font-medium">Cover brief</h2>
            <p className="-mt-2 text-xs text-muted-foreground">
              {manuscript.title} by {author || "the author"}
              {genre ? ", " + genre.label : ""}.{" "}
              {genre
                ? "Covers in this genre usually have " + genre.coverLook + "."
                : "Choose a genre for this book in Manuscripts to get a look that suits it."}
            </p>
            <div className="space-y-1">
              <Label htmlFor="cover-style">Style</Label>
              <Select id="cover-style" value={brief.style} onChange={(e) => update({ style: e.target.value })}>
                {COVER_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cover-subject">What the cover shows</Label>
              <Textarea
                id="cover-subject"
                rows={3}
                value={brief.subject}
                hint="A lighthouse on a cliff at dusk, a lone figure walking toward it."
                onChange={(e) => update({ subject: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cover-palette">Colours and mood</Label>
              <Input
                id="cover-palette"
                value={brief.palette}
                hint="Deep teal and gold, quiet and hopeful"
                onChange={(e) => update({ palette: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cover-extra">Anything else</Label>
              <Textarea
                id="cover-extra"
                rows={2}
                value={brief.extra}
                hint="Things to avoid, a reference for the mood, details to include."
                onChange={(e) => update({ extra: e.target.value })}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={brief.lettering}
                onChange={(e) => update({ lettering: e.target.checked })}
              />
              <span>
                Letter the title and author name into the picture
                <span className="block text-xs text-muted-foreground">
                  Image models can misspell words. Leave this off to get clean artwork with space for your own lettering.
                </span>
              </span>
            </label>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">The prompt that will be sent</summary>
              <p className="mt-2 whitespace-pre-wrap rounded bg-muted p-2">{prompt}</p>
            </details>
            <div className="flex items-center gap-2">
              <Select
                className="w-32"
                value={count}
                aria-label="Number of pictures"
                onChange={(e) => setCount(Number(e.target.value))}
              >
                <option value={1}>1 picture</option>
                <option value={2}>2 pictures</option>
                <option value={3}>3 pictures</option>
              </Select>
              <Button className="flex-1" disabled={!ai || !online || busy !== null} onClick={() => void generate()}>
                <Sparkles /> {busy ?? "Make cover"}
              </Button>
            </div>
            {!online ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <WifiOff className="size-4" /> Offline. Your concepts are saved here; making new ones needs a connection.
              </p>
            ) : null}
            {ai ? (
              <p className="text-xs text-muted-foreground">
                Using {IMAGE_PROVIDER_LABEL[ai.provider]} {ai.model.trim() || "default model"}. Each picture is billed by the
                provider.
              </p>
            ) : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </Card>

          <PenNamePicker
            key={manuscript.genre ?? "no-genre"}
            idPrefix="cover"
            title={manuscript.title}
            genre={genre}
            currentName={workspace?.name ?? ""}
            onChoose={async (name) => {
              if (workspace) await patchWorkspace(workspace.id, { name });
            }}
          />
        </section>

        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Current cover</h2>
            {manuscript.cover ? (
              <div className="flex items-start gap-4">
                <CoverImage image={manuscript.cover} alt="Current cover" className="max-h-72 rounded border border-border shadow-sm" />
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>This is the cover that goes into the epub.</p>
                  <Button variant="ghost" size="sm" onClick={() => void patchManuscript(manuscript.id, { cover: undefined })}>
                    <ImageOff /> Remove cover
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start gap-5">
                <CoverMockup title={manuscript.title} author={author} genre={genre} />
                <div className="max-w-sm space-y-2 text-sm text-muted-foreground">
                  <p>
                    No cover picture yet. The mockup shows the title and pen name in the look of the genre, and needs no image key.
                    Click it to zoom.
                  </p>
                  <p>Make some concepts, then choose one with Use as cover. You can also upload your own image under Export.</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Concepts</h2>
            {concepts === undefined ? null : concepts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Your cover concepts will appear here, newest first.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {concepts.map((c) => (
                  <ConceptCard
                    key={c.id}
                    concept={c}
                    manuscript={manuscript}
                    isCover={
                      !!manuscript.cover && manuscript.cover.size === c.image.size && manuscript.cover.type === c.image.type
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function BookCover() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <BookCoverBody key={manuscript.id} manuscript={manuscript} />;
}
