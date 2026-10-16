import { useEffect, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { isSingleWord, lookupWord, type WordLookup as Lookup } from "@/lib/lookup";
import { Button } from "@/components/ui/button";

interface Picked {
  word: string;
  x: number;
  y: number;
}

/**
 * Wraps the writing area. Select one word in the text and a "Look up" button appears
 * beside it; it opens the dictionary, thesaurus and spelling for that word. A synonym or
 * suggestion clicked in the card replaces the selected word in the text.
 */
export function WordLookupArea({ children, className }: { children: ReactNode; className?: string }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [open, setOpen] = useState(false);

  function readSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    if (!selection || selection.rangeCount === 0 || !isSingleWord(text)) {
      // Selecting something else (or typing) closes the card; the next word needs its own "Look up".
      setPicked(null);
      setOpen(false);
      return;
    }
    const box = selection.getRangeAt(0).getBoundingClientRect();
    setPicked({ word: text, x: box.left, y: box.bottom });
  }

  return (
    <div className={className} onMouseUp={readSelection} onKeyUp={readSelection}>
      {children}
      {picked && !open ? (
        <Button
          size="sm"
          variant="secondary"
          className="fixed z-50 shadow-md"
          style={{ left: Math.max(8, Math.min(picked.x, window.innerWidth - 220)), top: picked.y + 6 }}
          // Keeps the text selection while the button is pressed.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(true)}
        >
          <Search /> Look up &ldquo;{picked.word}&rdquo;
        </Button>
      ) : null}
      {picked && open ? (
        <LookupCard
          key={picked.word}
          word={picked.word}
          anchor={{ x: picked.x, y: picked.y }}
          onClose={() => {
            setOpen(false);
            setPicked(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LookupCard({ word, anchor, onClose }: { word: string; anchor: { x: number; y: number }; onClose: () => void }) {
  const [result, setResult] = useState<Lookup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    lookupWord(word)
      .then((r) => active && setResult(r))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "The lookup failed."));
    return () => {
      active = false;
    };
  }, [word]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Puts a replacement in place of the selected word, if the selection is still that word. */
  function replace(text: string) {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().toLowerCase() === word.toLowerCase()) {
      document.execCommand("insertText", false, text);
    }
    onClose();
  }

  const left = Math.max(8, Math.min(anchor.x, window.innerWidth - 336));
  const top = Math.min(anchor.y + 6, window.innerHeight - 120);

  return (
    <div
      role="dialog"
      aria-label={`Dictionary and thesaurus for ${word}`}
      onMouseUp={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      style={{ left, top, maxHeight: "70vh" }}
      className="fixed z-50 flex w-80 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-base font-semibold">{result?.word ?? word}</h2>
          {result?.phonetic ? <p className="text-xs text-muted-foreground">{result.phonetic}</p> : null}
        </div>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" title="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
        {error ? <p className="text-destructive">{error}</p> : null}
        {!error && !result ? <p className="text-muted-foreground">Looking up...</p> : null}
        {result ? (
          <>
            <section className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Dictionary</h3>
              {result.found ? (
                result.meanings.map((m, i) => (
                  <div key={`${m.partOfSpeech}-${i}`} className="space-y-1">
                    <p className="text-xs italic text-muted-foreground">{m.partOfSpeech}</p>
                    <ol className="list-decimal space-y-1 pl-5">
                      {m.definitions.map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ol>
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground">Not found in the dictionary.</p>
              )}
            </section>

            {!result.found && result.spellingSuggestions.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Spelling</h3>
                <p className="text-xs text-muted-foreground">Did you mean? Click a word to put it in place of the selected word.</p>
                <WordChips words={result.spellingSuggestions} onPick={replace} />
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Thesaurus</h3>
              {result.synonyms.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">Synonyms</p>
                  <WordChips words={result.synonyms} onPick={replace} />
                </>
              ) : (
                <p className="text-muted-foreground">No synonyms found.</p>
              )}
              {result.antonyms.length > 0 ? (
                <>
                  <p className="pt-1 text-xs text-muted-foreground">Opposites</p>
                  <WordChips words={result.antonyms} onPick={replace} />
                </>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function WordChips({ words, onPick }: { words: string[]; onPick: (word: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {words.map((w) => (
        <button
          key={w}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(w)}
          className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent"
        >
          {w}
        </button>
      ))}
    </div>
  );
}
