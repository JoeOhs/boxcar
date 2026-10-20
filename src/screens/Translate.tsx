import { useState } from "react";
import { Check, Languages, PenLine, Plus, SpellCheck, Sparkles, Undo2 } from "lucide-react";
import { db, type Chapter, type Id, type Manuscript, type TranslationState } from "@/db/schema";
import { useAiSettings, aiReachable } from "@/lib/ai";
import { numberChapters, sortChapters } from "@/lib/chapters";
import { useChapters, useTranslations } from "@/lib/hooks";
import { getAiSettings } from "@/lib/keyVault";
import { LANGUAGE_PRESETS, languageName } from "@/lib/bookTypes";
import {
  createTranslation,
  proofreadTranslation,
  setChapterApproved,
  translateChapter,
  type TargetLanguage,
} from "@/lib/translate";
import { htmlToText, textToParagraphs } from "@/lib/text";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const STATE_LABEL: Record<TranslationState, string> = {
  pending: "Not translated",
  translated: "Translated",
  proofread: "Proofread by AI",
  approved: "Approved",
};

const OTHER = "other";

function languageOf(manuscript: Pick<Manuscript, "language" | "languageName">): string {
  return manuscript.languageName ?? languageName(manuscript.language) ?? manuscript.language;
}

/** The paragraphs of a chapter's text, for reading side by side. */
function paragraphsOf(chapter: Chapter | undefined): string[] {
  return chapter ? textToParagraphs(htmlToText(chapter.content)) : [];
}

/** Makes a new translation of the book, with the language the author picks. */
function NewTranslationForm({ source, onDone, onCancel }: { source: Manuscript; onDone: (id: Id) => void; onCancel: (() => void) | null }) {
  const [choice, setChoice] = useState<string>(LANGUAGE_PRESETS[0].code);
  const [otherName, setOtherName] = useState("");
  const [otherCode, setOtherCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target: TargetLanguage | null =
    choice === OTHER
      ? otherName.trim() && otherCode.trim()
        ? { name: otherName.trim(), code: otherCode.trim() }
        : null
      : { name: languageName(choice) ?? choice, code: choice };

  async function create() {
    if (!target || busy) return;
    setBusy(true);
    setError(null);
    try {
      const translation = await createTranslation(source, target);
      onDone(translation.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The translation could not be made.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <h2 className="font-serif text-lg font-semibold">New translation</h2>
      <p className="text-sm text-muted-foreground">
        A copy of {source.title} is made in the language you choose, with the same chapters. Nothing is translated yet: you ask for each
        chapter in turn, read it, and may have the AI proofread it before you approve it.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tr-language">Language</Label>
          <Select id="tr-language" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {LANGUAGE_PRESETS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
            <option value={OTHER}>Another language...</option>
          </Select>
        </div>
      </div>
      {choice === OTHER ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tr-other-name">Language name</Label>
            <Input id="tr-other-name" value={otherName} hint="e.g. Swahili" onChange={(e) => setOtherName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tr-other-code">Language code</Label>
            <Input id="tr-other-code" value={otherCode} hint="e.g. sw" onChange={(e) => setOtherCode(e.target.value)} />
          </div>
        </div>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button disabled={!target || busy} onClick={() => void create()}>
          <Languages /> {busy ? "Making..." : "Make translation"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** One chapter of a translation: the original beside it, and the steps to translate, proofread and approve it. */
function ChapterReview({
  source,
  translation,
  chapter,
  original,
}: {
  source: Manuscript;
  translation: Manuscript;
  chapter: Chapter;
  original: Chapter | undefined;
}) {
  const { online, navigate, selectManuscript, setChapterId } = useApp();
  const ai = useAiSettings();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const state: TranslationState = chapter.translationState ?? "pending";
  const reachable = ai ? aiReachable(ai, online) : false;
  const target: TargetLanguage = { code: translation.language, name: languageOf(translation) };

  async function run(label: string, task: () => Promise<string>) {
    setBusy(label);
    setMessage(null);
    try {
      const text = await task();
      setMessage({ ok: true, text });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "That did not work. Try again." });
    } finally {
      setBusy(null);
    }
  }

  async function currentChapter(): Promise<Chapter> {
    return (await db.chapters.get(chapter.id)) ?? chapter;
  }

  function translate() {
    void run("translate", async () => {
      if (!original) throw new Error("The original chapter could not be found.");
      const settings = await getAiSettings();
      if (!settings) throw new Error("Add your AI key in Settings first.");
      await translateChapter(settings, original, await currentChapter(), target);
      return `Translated into ${target.name}. Read it through, then proofread it with the AI or approve it.`;
    });
  }

  function proofread() {
    void run("proofread", async () => {
      const settings = await getAiSettings();
      if (!settings) throw new Error("Add your AI key in Settings first.");
      const count = await proofreadTranslation(settings, await currentChapter());
      return count === 0
        ? "The proofreader found nothing to change."
        : `The proofreader made ${count} ${count === 1 ? "suggestion" : "suggestions"}. Accept or reject them in Edit.`;
    });
  }

  function approve() {
    void run("approve", async () => {
      const approved = state !== "approved";
      await setChapterApproved(chapter.id, approved);
      return approved ? "Approved. It is final in the translation." : "Approval taken back.";
    });
  }

  function openIn(screen: "edit" | "write") {
    selectManuscript(translation.id);
    setChapterId(chapter.id);
    navigate(screen);
  }

  const sourceParagraphs = paragraphsOf(original);
  const translatedParagraphs = paragraphsOf(chapter);
  const canProofread = state === "translated" || state === "proofread";
  const canApprove = state !== "pending";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{STATE_LABEL[state]}</Badge>
        <span className="text-xs text-muted-foreground">
          {original?.title || "Untitled chapter"} in {languageOf(source)} - {languageOf(translation)} version
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" disabled={!reachable || busy !== null || !original} onClick={translate}>
            <Sparkles /> {busy === "translate" ? "Translating..." : state === "pending" ? "Translate this chapter" : "Translate again"}
          </Button>
          <Button size="sm" variant="outline" disabled={!reachable || busy !== null || !canProofread} onClick={proofread}>
            <SpellCheck /> {busy === "proofread" ? "Proofreading..." : "Proofread with AI"}
          </Button>
          <Button size="sm" variant={state === "approved" ? "secondary" : "outline"} disabled={busy !== null || !canApprove} onClick={approve}>
            <Check /> {state === "approved" ? "Approved - take back" : "Approve chapter"}
          </Button>
        </div>
      </div>

      {!ai && !busy ? (
        <p className="text-sm text-muted-foreground">Translating and proofreading need an AI key. Add one in Settings.</p>
      ) : null}
      {ai && !reachable ? (
        <p className="text-sm text-muted-foreground">You are offline. Translating and proofreading need a connection; reading and approving do not.</p>
      ) : null}
      {message ? <p className={cn("text-sm", message.ok ? "text-success" : "text-destructive")}>{message.text}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Original ({languageOf(source)})</h3>
          {sourceParagraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">This chapter has no text.</p>
          ) : (
            sourceParagraphs.map((p, i) => (
              <p key={i} className="font-serif text-sm leading-relaxed">
                {p}
              </p>
            ))
          )}
        </Card>
        <Card className="space-y-2 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Translation ({languageOf(translation)})</h3>
          {translatedParagraphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not translated yet.</p>
          ) : (
            translatedParagraphs.map((p, i) => (
              <p key={i} className="font-serif text-sm leading-relaxed">
                {p}
              </p>
            ))
          )}
        </Card>
      </div>

      {canProofread || canApprove ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => openIn("write")}>
            <PenLine /> Edit the translation in Write
          </Button>
          {state === "proofread" ? (
            <Button size="sm" variant="ghost" onClick={() => openIn("edit")}>
              <Undo2 /> Review the proofreading in Edit
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A translation: its chapters on the left, one chapter at a time on the right. */
function TranslationWork({ source, translation }: { source: Manuscript; translation: Manuscript }) {
  const translatedChapters = useChapters(translation.id);
  const originals = useChapters(source.id);
  const [chosenId, setChosenId] = useState<Id | null>(null);

  if (translatedChapters === undefined || originals === undefined) return null;
  const numbers = numberChapters(translatedChapters);
  const chapter = translatedChapters.find((c) => c.id === chosenId) ?? translatedChapters[0];
  const approved = translatedChapters.filter((c) => c.translationState === "approved").length;
  const originalFor = (c: Chapter) => originals.find((o) => o.id === c.sourceChapterId);

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="w-64 shrink-0 space-y-3 overflow-y-auto border-r border-border p-3">
        <p className="text-xs text-muted-foreground">
          {approved} of {translatedChapters.length} {translatedChapters.length === 1 ? "chapter" : "chapters"} approved
        </p>
        {sortChapters(translatedChapters).map((c) => {
          const original = originalFor(c);
          const label = c.kind === "chapter" ? `${numbers.get(c.id) ?? ""}. ` : "";
          const state: TranslationState = c.translationState ?? "pending";
          return (
            <button
              key={c.id}
              onClick={() => setChosenId(c.id)}
              aria-current={chapter?.id === c.id ? "true" : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                chapter?.id === c.id ? "bg-accent font-medium" : "hover:bg-accent/50",
              )}
            >
              <span className="min-w-0 truncate">
                {label}
                {original?.title || c.title || (c.kind === "chapter" ? "Untitled chapter" : c.kind === "front" ? "Front matter" : "Back matter")}
              </span>
              <span className={cn("shrink-0 text-[11px]", state === "approved" ? "text-success" : "text-muted-foreground")}>
                {state === "approved" ? <Check className="size-3.5" /> : STATE_LABEL[state]}
              </span>
            </button>
          );
        })}
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-6">
        {chapter ? (
          <ChapterReview source={source} translation={translation} chapter={chapter} original={originalFor(chapter)} />
        ) : (
          <p className="text-sm text-muted-foreground">This translation has no chapters.</p>
        )}
      </section>
    </div>
  );
}

function TranslateBody({ source }: { source: Manuscript }) {
  const translations = useTranslations(source.id);
  const [chosenId, setChosenId] = useState<Id | null>(null);
  const [creating, setCreating] = useState(false);
  const { selectManuscript } = useApp();

  if (source.translationOf) {
    return (
      <div className="flex h-full flex-col">
        <ScreenHeader title="Translate" description={`${source.title} is itself a translation.`} />
        <div className="p-6">
          <Card className="max-w-xl space-y-3 p-5">
            <p className="text-sm text-muted-foreground">Translations are made from the original book. Open the original to start another translation.</p>
            <Button size="sm" onClick={() => selectManuscript(source.translationOf!)}>
              Open the original
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  const list = translations ?? [];
  const active = list.find((t) => t.id === chosenId) ?? list[0];
  const showForm = creating || (translations !== undefined && list.length === 0);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Translate"
        description={`Translations of ${source.title}, made one chapter at a time.`}
        actions={
          list.length > 0 && !creating ? (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus /> New translation
            </Button>
          ) : null
        }
      />
      {translations === undefined ? null : showForm ? (
        <div className="p-6">
          <NewTranslationForm
            source={source}
            onDone={(id) => {
              setChosenId(id);
              setCreating(false);
            }}
            onCancel={list.length > 0 ? () => setCreating(false) : null}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-56 shrink-0 space-y-1 border-r border-border p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Translations</p>
            {list.map((t) => (
              <button
                key={t.id}
                onClick={() => setChosenId(t.id)}
                aria-current={active?.id === t.id ? "true" : undefined}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active?.id === t.id ? "bg-accent font-medium" : "hover:bg-accent/50",
                )}
              >
                {languageOf(t)}
              </button>
            ))}
          </aside>
          {active ? <TranslationWork key={active.id} source={source} translation={active} /> : null}
        </div>
      )}
    </div>
  );
}

export function Translate() {
  const { manuscript } = useApp();
  if (!manuscript) return <NoManuscript />;
  return <TranslateBody key={manuscript.id} source={manuscript} />;
}
