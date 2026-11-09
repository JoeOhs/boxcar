import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Send, Sparkles, Trash2, WifiOff, X } from "lucide-react";
import { db, newId, type AgentMessage, type Id, type Manuscript } from "@/db/schema";
import { aiReachable, askAi, systemPrompt, useAiSettings, type ChatTurn } from "@/lib/ai";
import { genreById, genreContext } from "@/lib/genres";
import { useChapters, useOnline, useResearchNotes } from "@/lib/hooks";
import { outlineToText } from "@/lib/outline";
import { researchContext } from "@/lib/research";
import { useOutlineItems } from "@/lib/hooks";
import { htmlToText } from "@/lib/text";
import { universeToText, useUniverseNodes } from "@/lib/universe";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** One mirrored scene of the author's chapter, read-only in the Ghostwriter's space. */
export interface MirroredScene {
  id: Id;
  title: string;
  html: string;
}

/** The Ghostwriter's in-progress writing: what it is typing, and where in the mirror it goes. */
interface GhostDraft {
  /** The scene it continues. null = the end of the chapter. */
  sceneId: Id | null;
  /** The whole reply. */
  full: string;
  /** How much of it has been typed into the space so far. */
  shown: number;
  /** True once it is all typed out and the check box appears. */
  done: boolean;
}

/** The Ghostwriter's writing, highlighted inside the mirrored space, with a caret while it types. */
function GhostBlock({ draft }: { draft: GhostDraft }) {
  const typed = draft.full.slice(0, draft.shown);
  return (
    <div className="my-3 rounded-md border-2 border-dashed border-warning/70 bg-warning/15 px-3 py-2" aria-label="The Ghostwriter's writing">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-warning">Ghostwriter · not in your manuscript yet</p>
      <p className="whitespace-pre-wrap">
        {typed}
        {draft.done ? null : <span className="animate-pulse">▌</span>}
      </p>
    </div>
  );
}

/**
 * The Ghostwriter's writing space, beside the author's. It mirrors the author's
 * scenes as they are written, read-only, and writes its answer straight into
 * that mirror, highlighted, so the author watches the change happen. When the
 * writing is complete a check box appears at the top right of the space; ticking
 * it pushes the highlighted text into the author's manuscript.
 */
export function Ghostwriter({
  manuscript,
  chapterId,
  chapterTitle,
  scenes,
  selectedSceneId,
  onAppend,
}: {
  manuscript: Manuscript;
  /** The open chapter; its mirror is cleared of unreviewed writing when it changes. */
  chapterId: Id | null;
  chapterTitle: string;
  scenes: MirroredScene[];
  /** The scene the author is working in; the Ghostwriter's writing continues it. */
  selectedSceneId?: Id;
  onAppend: (sceneId: Id | null, text: string) => void;
}) {
  const { navigate } = useApp();
  const ai = useAiSettings();
  const online = useOnline();
  const reachable = aiReachable(ai, online);
  const research = useResearchNotes(manuscript.id);
  const nodes = useUniverseNodes(manuscript.id);
  const outline = useOutlineItems(manuscript.id);
  const chapters = useChapters(manuscript.id);
  const [prompt, setPrompt] = useState("");
  const [ghost, setGhost] = useState<GhostDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);

  const messages = useLiveQuery(
    async () => {
      const rows = await db.agentMessages.where("manuscriptId").equals(manuscript.id).filter((m) => m.role === "ghostwriter").toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    },
    [manuscript.id],
  );

  // The mirror belongs to the chapter; switching chapters clears the unreviewed writing.
  useEffect(() => {
    setGhost(null);
  }, [chapterId]);

  // The typing: the reply is revealed into the mirrored space a few words at a time.
  useEffect(() => {
    if (!ghost || ghost.done) return;
    const timer = window.setInterval(() => {
      setGhost((current) => {
        if (!current || current.done) return current;
        const step = Math.max(6, Math.ceil(current.full.length / 110));
        const shown = Math.min(current.full.length, current.shown + step);
        return { ...current, shown, done: shown >= current.full.length };
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [ghost?.done]);

  // Keep the highlighted writing in view while it is typed.
  useEffect(() => {
    ghostRef.current?.scrollIntoView({ block: "end" });
  }, [ghost?.shown]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, busy]);

  function context(): string {
    const manuscriptText = (chapters ?? [])
      .filter((chapter) => chapter.kind !== "scrap")
      .map((chapter) => `${chapter.title || "Untitled"}:\n${htmlToText(chapter.content)}`)
      .filter((block) => block.split("\n").slice(1).join("").trim())
      .join("\n\n")
      .slice(0, 12000);
    const mirroredText = scenes
      .map((scene) => [scene.title ? `Scene: ${scene.title}` : "", htmlToText(scene.html)].filter(Boolean).join("\n"))
      .filter(Boolean)
      .join("\n\n");
    const parts = [
      `Title: ${manuscript.title}`,
      genreContext(genreById(manuscript.genre)),
      manuscript.description.trim() ? `Description: ${manuscript.description}` : "",
      research ? researchContext(research) : "",
      nodes && nodes.length > 0 ? `THE UNIVERSE (characters, places, situations and the wider world):\n${universeToText(nodes)}` : "",
      outline && outline.length > 0 ? `THE OUTLINE:\n${outlineToText(outline)}` : "",
      manuscriptText ? `THE WORKING MANUSCRIPT (read-only):\n${manuscriptText}` : "",
      `The author is writing the chapter "${chapterTitle || "Untitled"}". Here it is, read-only:\n${mirroredText.slice(-8000) || "(empty so far)"}`,
    ];
    return parts.filter(Boolean).join("\n\n");
  }

  async function ask(text: string) {
    const content = text.trim();
    if (!content || !ai || busy) return;
    setBusy(true);
    setError(null);
    const userMessage: AgentMessage = {
      id: newId(),
      manuscriptId: manuscript.id,
      role: "ghostwriter",
      from: "user",
      text: content,
      createdAt: Date.now(),
    };
    try {
      await db.agentMessages.add(userMessage);
      setPrompt("");
      const history = [...(messages ?? []), userMessage].slice(-10);
      const turns: ChatTurn[] = history.map((message) => ({
        role: message.from === "user" ? "user" : "assistant",
        content: message.text,
      }));
      while (turns.length > 0 && turns[0].role !== "user") turns.shift();
      const reply = await askAi(ai, systemPrompt("ghostwriter", context()), turns);
      await db.agentMessages.add({
        id: newId(),
        manuscriptId: manuscript.id,
        role: "ghostwriter",
        from: "agent",
        text: reply,
        createdAt: Date.now(),
      });
      setGhost({ sceneId: selectedSceneId ?? null, full: reply, shown: 0, done: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Ghostwriter could not answer.");
    } finally {
      setBusy(false);
    }
  }

  /** Ticking the check box pushes the Ghostwriter's finished writing into the author's chapter. */
  function push() {
    if (!ghost?.done) return;
    onAppend(ghost.sceneId, ghost.full);
    setGhost(null);
  }

  async function clear() {
    if (!window.confirm("Clear your conversation with the Ghostwriter?")) return;
    const ids = await db.agentMessages.where("manuscriptId").equals(manuscript.id).filter((m) => m.role === "ghostwriter").primaryKeys();
    await db.agentMessages.bulkDelete(ids);
    setGhost(null);
  }

  const quickPrompts = [
    { label: "Continue", prompt: "Continue from where the writing stops, in my voice. Write about 200 words." },
    { label: "What happens next?", prompt: "Suggest three different directions the story could take after this point, one or two sentences each." },
    { label: "Tighten it", prompt: "Rewrite this more tightly, keeping its events, voice and meaning." },
    { label: "Add description", prompt: "Write a paragraph of description that fits this moment, in my voice." },
  ];

  const ghostPlaced = ghost && ghost.sceneId && scenes.some((scene) => scene.id === ghost.sceneId);

  return (
    <aside className="flex w-[30rem] shrink-0 flex-col border-l border-border" aria-label="Ghostwriter">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <h2 className="flex items-center gap-1.5 font-serif text-sm font-semibold">
          <Sparkles className="size-4 text-muted-foreground" /> Ghostwriter
        </h2>
        {messages && messages.length > 0 ? (
          <Button variant="ghost" size="icon" title="Clear conversation" onClick={() => void clear()}>
            <Trash2 />
          </Button>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto border-b border-border bg-muted/20" aria-label="The Ghostwriter's writing space">
        {ghost?.done ? (
          <div className="sticky top-2 z-10 flex justify-end pr-3">
            <div className="flex items-center gap-1 rounded-md border border-border bg-card/95 px-2 py-1 shadow-lg backdrop-blur-sm">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium" title="Push the highlighted writing into your chapter">
                <input type="checkbox" className="size-3.5 accent-primary" onChange={push} />
                <Check className="size-3.5" /> Push into your chapter
              </label>
              <button className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Discard this writing" aria-label="Discard this writing" onClick={() => setGhost(null)}>
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : null}
        <div className="prose-manuscript px-5 py-4 text-[15px] leading-7">
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {chapterTitle.trim() || "Untitled chapter"} · mirrored from your writing space
          </p>
          {scenes.length === 0 && !ghost ? (
            <p className="text-center text-sm text-muted-foreground">Your scenes appear here as you write them.</p>
          ) : null}
          {scenes.map((scene) => (
            <section key={scene.id} className="mb-4">
              {scene.title.trim() ? <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{scene.title}</p> : null}
              {htmlToText(scene.html).trim() ? (
                <div dangerouslySetInnerHTML={{ __html: scene.html }} />
              ) : (
                <p className="text-sm italic text-muted-foreground">An empty scene.</p>
              )}
              {ghostPlaced && ghost.sceneId === scene.id ? (
                <div ref={ghostRef}>
                  <GhostBlock draft={ghost} />
                </div>
              ) : null}
            </section>
          ))}
          {ghost && !ghostPlaced ? (
            <div ref={ghostRef}>
              <GhostBlock draft={ghost} />
            </div>
          ) : null}
          {busy && !ghost ? <p className="text-sm text-muted-foreground">The Ghostwriter is writing...</p> : null}
        </div>
      </div>

      <div className="max-h-44 shrink-0 space-y-2 overflow-y-auto px-3 py-2" aria-label="Conversation with the Ghostwriter">
        {messages?.map((message) => (
          <div key={message.id} className={message.from === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={cn(
                "max-w-[95%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-xs",
                message.from === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {message.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 space-y-2 border-t border-border p-3">
        {!reachable ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <WifiOff className="size-4" /> Offline. You can read past writing; asking needs a connection.
          </p>
        ) : null}
        {ai === null ? (
          <p className="text-xs text-muted-foreground">
            The Ghostwriter uses your own AI key.{" "}
            <button className="underline" onClick={() => navigate("settings")}>
              Add it in Settings
            </button>
            .
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((quick) => (
            <Button
              key={quick.label}
              variant="outline"
              size="sm"
              disabled={!ai || busy || !reachable}
              onClick={() => void ask(quick.prompt)}
            >
              {quick.label}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(prompt);
              }
            }}
            hint="Prompt the Ghostwriter"
            className="min-h-10 resize-none"
            rows={2}
            disabled={!ai}
          />
          <Button size="icon" title="Send" disabled={!ai || busy || !reachable || !prompt.trim()} onClick={() => void ask(prompt)}>
            <Send />
          </Button>
        </div>
      </div>
    </aside>
  );
}
