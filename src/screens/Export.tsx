import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileDown, Headphones, ImageUp, Trash2 } from "lucide-react";
import { db, type Manuscript } from "@/db/schema";
import { downloadBlob, fileSafeName } from "@/lib/download";
import { buildEpub } from "@/lib/epub";
import { useChapters } from "@/lib/hooks";
import { getAiSettings } from "@/lib/keyVault";
import { AI_VOICES, buildAudiobook, DEFAULT_AI_VOICE, NEEDS_OPENAI_KEY } from "@/lib/narration";
import { patchManuscript } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const KDP_KEYWORD_LIMIT = 7;

/**
 * The audiobook: each chapter read in the AI voice, one MP3 per chapter, saved
 * together in a zip. It is a post-publishing option, so it uses the author's
 * OpenAI key and needs a connection.
 */
function AudiobookCard({ manuscript }: { manuscript: Manuscript }) {
  const { online } = useApp();
  const [voice, setVoice] = useState(DEFAULT_AI_VOICE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function make() {
    setBusy(true);
    setResult(null);
    setProgress("Starting...");
    try {
      const settings = await getAiSettings();
      if (!settings || settings.provider !== "openai") throw new Error(NEEDS_OPENAI_KEY);
      if (!online) throw new Error("You are offline. The audiobook needs a connection; your text is safe on this computer.");
      const fresh = await db.manuscripts.get(manuscript.id);
      if (!fresh) throw new Error("This manuscript no longer exists.");
      const rows = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
      const zip = await buildAudiobook(settings.apiKey, fresh, rows, voice, setProgress);
      const filename = `${fileSafeName(fresh.title)}-audiobook.zip`;
      downloadBlob(zip, filename);
      setResult({ ok: true, text: `Saved ${filename}: one MP3 per chapter.` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "The audiobook could not be made." });
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Headphones className="size-4" /> Audiobook
      </h2>
      <p className="text-xs text-muted-foreground">
        {manuscript.title} read aloud by an AI voice, one MP3 per chapter. Uses your OpenAI key, and each chapter is billed by the provider.
      </p>
      <div className="flex gap-2">
        <Select className="h-8 w-32" aria-label="Audiobook voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
          {AI_VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={busy} onClick={() => void make()}>
          <Headphones /> {busy ? "Recording..." : "Make audiobook"}
        </Button>
      </div>
      {busy && progress ? <p className="text-xs text-muted-foreground">{progress}</p> : null}
      {result ? <p className={cn("text-sm", result.ok ? "text-success" : "text-destructive")}>{result.text}</p> : null}
    </Card>
  );
}


const KDP_DESCRIPTION_LIMIT = 4000;

function BookDetails({ manuscript }: { manuscript: Manuscript }) {
  const [title, setTitle] = useState(manuscript.title);
  const [subtitle, setSubtitle] = useState(manuscript.subtitle);
  const [description, setDescription] = useState(manuscript.description);
  const [language, setLanguage] = useState(manuscript.language);
  const [isbn, setIsbn] = useState(manuscript.isbn);
  const [copyright, setCopyright] = useState(manuscript.copyright);
  const [keywords, setKeywords] = useState(manuscript.keywords.join(", "));

  const id = manuscript.id;
  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-medium">Book details</h2>
      <p className="-mt-2 text-xs text-muted-foreground">These go into the epub and match what Amazon KDP asks for.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="b-title">Title</Label>
          <Input
            id="b-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (e.target.value.trim()) void patchManuscript(id, { title: e.target.value });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="b-subtitle">Subtitle</Label>
          <Input
            id="b-subtitle"
            value={subtitle}
            onChange={(e) => {
              setSubtitle(e.target.value);
              void patchManuscript(id, { subtitle: e.target.value });
            }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="b-description">Description</Label>
          <span className={cn("text-[11px]", description.length > KDP_DESCRIPTION_LIMIT ? "text-destructive" : "text-muted-foreground")}>
            {description.length} / {KDP_DESCRIPTION_LIMIT}
          </span>
        </div>
        <Textarea
          id="b-description"
          rows={6}
          value={description}
          hint="The text readers see on the store page."
          onChange={(e) => {
            setDescription(e.target.value);
            void patchManuscript(id, { description: e.target.value });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="b-keywords">Keywords (separated by commas)</Label>
        <Input
          id="b-keywords"
          value={keywords}
          onChange={(e) => {
            setKeywords(e.target.value);
            void patchManuscript(id, {
              keywords: e.target.value
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean),
            });
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="b-language">Language code</Label>
          <Input
            id="b-language"
            value={language}
            hint="en"
            onChange={(e) => {
              setLanguage(e.target.value);
              void patchManuscript(id, { language: e.target.value.trim() });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="b-isbn">ISBN (optional)</Label>
          <Input
            id="b-isbn"
            value={isbn}
            onChange={(e) => {
              setIsbn(e.target.value);
              void patchManuscript(id, { isbn: e.target.value.trim() });
            }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="b-copyright">Copyright page</Label>
        <Textarea
          id="b-copyright"
          rows={3}
          value={copyright}
          onChange={(e) => {
            setCopyright(e.target.value);
            void patchManuscript(id, { copyright: e.target.value });
          }}
        />
      </div>
    </Card>
  );
}

function CoverPicker({ manuscript }: { manuscript: Manuscript }) {
  const [cover, setCover] = useState<Blob | undefined>(manuscript.cover);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cover) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(cover);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [cover]);

  async function choose(file: File | undefined) {
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setError("Choose a JPEG or PNG image.");
      return;
    }
    setError(null);
    setCover(file);
    await patchManuscript(manuscript.id, { cover: file });
  }

  async function remove() {
    setCover(undefined);
    await patchManuscript(manuscript.id, { cover: undefined });
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-medium">Cover</h2>
      {url ? (
        <img src={url} alt="Cover" className="mx-auto max-h-64 rounded border border-border shadow-sm" />
      ) : (
        <div className="flex h-40 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">
          No cover yet
        </div>
      )}
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm">
          <label className="cursor-pointer">
            <ImageUp /> {cover ? "Replace" : "Choose image"}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        {cover ? (
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
            <Trash2 /> Remove
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-xs text-muted-foreground">KDP recommends a JPEG about 1600 x 2560 pixels.</p>
    </Card>
  );
}

function ExportBody({ manuscript }: { manuscript: Manuscript }) {
  const { workspace } = useApp();
  const chapters = useChapters(manuscript.id);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const written = (chapters ?? []).filter((c) => c.wordCount > 0);
  const emptyCount = (chapters ?? []).length - written.length;
  const checks: { label: string; ok: boolean; blocking: boolean }[] = [
    { label: "A pen name is set for this workspace", ok: !!workspace?.name.trim(), blocking: true },
    { label: "At least one chapter has text", ok: written.length > 0, blocking: true },
    { label: emptyCount > 0 ? `${emptyCount} empty chapter${emptyCount === 1 ? "" : "s"} will be exported blank` : "No empty chapters", ok: emptyCount === 0, blocking: false },
    { label: "Cover image added", ok: !!manuscript.cover, blocking: false },
    { label: "Description written", ok: !!manuscript.description.trim(), blocking: false },
    { label: `Keywords added (up to ${KDP_KEYWORD_LIMIT})`, ok: manuscript.keywords.length > 0 && manuscript.keywords.length <= KDP_KEYWORD_LIMIT, blocking: false },
    { label: "Language code set", ok: !!manuscript.language.trim(), blocking: false },
  ];
  const canExport = checks.every((c) => c.ok || !c.blocking);

  async function exportEpub() {
    setBusy(true);
    setResult(null);
    try {
      const fresh = await db.manuscripts.get(manuscript.id);
      const rows = await db.chapters.where("manuscriptId").equals(manuscript.id).toArray();
      if (!fresh) throw new Error("This manuscript no longer exists.");
      const blob = await buildEpub(fresh, workspace?.name ?? "", rows);
      const filename = `${fileSafeName(fresh.title)}.epub`;
      downloadBlob(blob, filename);
      await patchManuscript(manuscript.id, { lastExportedAt: Date.now() });
      setResult({ ok: true, text: `Saved ${filename}. Upload it in Amazon KDP.` });
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "The export failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Export"
        description={`Turn ${manuscript.title} into an epub for Amazon KDP.`}
        actions={
          <Button disabled={!canExport || busy} onClick={() => void exportEpub()}>
            <FileDown /> {busy ? "Building..." : "Export"}
          </Button>
        }
      />
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 xl:grid-cols-[1fr_22rem]">
        <BookDetails manuscript={manuscript} />
        <div className="space-y-6">
          <CoverPicker manuscript={manuscript} />
          <AudiobookCard manuscript={manuscript} />
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-medium">Before you publish</h2>
            <ul className="space-y-1.5">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.ok ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className={cn("mt-0.5 size-4 shrink-0", c.blocking ? "text-destructive" : "text-warning")} />
                  )}
                  <span className={c.ok ? "text-muted-foreground" : ""}>{c.label}</span>
                </li>
              ))}
            </ul>
            {manuscript.lastExportedAt ? (
              <p className="text-xs text-muted-foreground">Last exported {formatDate(manuscript.lastExportedAt)}</p>
            ) : null}
            {result ? <p className={cn("text-sm", result.ok ? "text-success" : "text-destructive")}>{result.text}</p> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

export function Export() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <ExportBody key={manuscript.id} manuscript={manuscript} />;
}
