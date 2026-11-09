import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Send, Sparkles, Trash2, WifiOff } from "lucide-react";
import { db, newId, type AgentMessage, type Manuscript } from "@/db/schema";
import { aiReachable, askAi, systemPrompt, useAiSettings, type ChatTurn } from "@/lib/ai";
import { genreById, genreContext } from "@/lib/genres";
import { useOnline, useResearchNotes } from "@/lib/hooks";
import { outlineToText } from "@/lib/outline";
import { researchContext } from "@/lib/research";
import { useOutlineItems } from "@/lib/hooks";
import { universeToText, useUniverseNodes } from "@/lib/universe";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The Ghostwriter's own writing space, beside the author's. It mirrors the
 * chapter being written, reads the research, Universe, characters and outline
 * (read-only), and writes its proposal in its own pane. Nothing reaches the
 * author's manuscript until the author pushes it in.
 */
export function Ghostwriter({
  manuscript,
  chapterTitle,
  reflectedText,
  sceneTitle,
  onAppend,
  onReplace,
}: {
  manuscript: Manuscript;
  chapterTitle: string;
  /** The chapter or selected scene as it is in the author's writing space right now. */
  reflectedText: string;
  sceneTitle?: string;
  onAppend: (text: string) => void;
  onReplace: (text: string) => void;
}) {
  const { navigate } = useApp();
  const ai = useAiSettings();
  const online = useOnline();
  const reachable = aiReachable(ai, online);
  const research = useResearchNotes(manuscript.id);
  const nodes = useUniverseNodes(manuscript.id);
  const outline = useOutlineItems(manuscript.id);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const messages = useLiveQuery(
    async () => {
      const rows = await db.agentMessages.where("manuscriptId").equals(manuscript.id).filter((m) => m.role === "ghostwriter").toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    },
    [manuscript.id],
  );

  useEffect(() => {
    setOutput("");
  }, [chapterTitle, sceneTitle]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, busy]);

  function context(): string {
    const parts = [
      `Title: ${manuscript.title}`,
      genreContext(genreById(manuscript.genre)),
      manuscript.description.trim() ? `Description: ${manuscript.description}` : "",
      research ? researchContext(research) : "",
      nodes && nodes.length > 0 ? `THE UNIVERSE (characters, places, situations and the wider world):\n${universeToText(nodes)}` : "",
      outline && outline.length > 0 ? `THE OUTLINE:\n${outlineToText(outline)}` : "",
      sceneTitle
        ? `The author is writing the scene "${sceneTitle}" in the chapter "${chapterTitle}". Here it is, read-only:\n${reflectedText.slice(-8000) || "(empty so far)"}`
        : `The author is writing the chapter "${chapterTitle}". Here it is, read-only:\n${reflectedText.slice(-8000) || "(empty so far)"}`,
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
      setOutput(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Ghostwriter could not answer.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm("Clear your conversation with the Ghostwriter?")) return;
    const ids = await db.agentMessages.where("manuscriptId").equals(manuscript.id).filter((m) => m.role === "ghostwriter").primaryKeys();
    await db.agentMessages.bulkDelete(ids);
    setOutput("");
  }

  const quickPrompts = [
    { label: "Continue", prompt: "Continue from where the writing stops, in my voice. Write about 200 words." },
    { label: "What happens next?", prompt: "Suggest three different directions the story could take after this point, one or two sentences each." },
    { label: "Tighten it", prompt: "Rewrite this more tightly, keeping its events, voice and meaning." },
    { label: "Add description", prompt: "Write a paragraph of description that fits this moment, in my voice." },
  ];

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

      <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <BookOpen className="size-3.5" /> Writing beside you in
        </p>
        <p className="truncate text-sm font-medium">{chapterTitle || "No chapter yet"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {sceneTitle ? `Scene: ${sceneTitle}` : "The whole chapter"} · read-only reflection
        </p>
        <p className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap text-[11px] text-muted-foreground">
          {reflectedText.trim().slice(-400) || "Nothing written in this chapter yet."}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {messages?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask the Ghostwriter to draft, continue or reshape the scene. Its writing appears here and does not touch your
            manuscript until you push it in.
          </p>
        ) : null}
        {messages?.map((message) => (
          <div key={message.id} className={message.from === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={cn(
                "max-w-[95%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                message.from === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {message.text}
            </div>
          </div>
        ))}
        {busy ? <p className="text-sm text-muted-foreground">The Ghostwriter is writing...</p> : null}
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
            hint="Ask the Ghostwriter to write"
            className="min-h-10 resize-none"
            rows={2}
            disabled={!ai}
          />
          <Button size="icon" title="Send" disabled={!ai || busy || !reachable || !prompt.trim()} onClick={() => void ask(prompt)}>
            <Send />
          </Button>
        </div>
        <div className="space-y-1 rounded-md border border-border p-2">
          <p className="text-xs font-medium">The Ghostwriter's writing space</p>
          <Textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            rows={5}
            hint="The Ghostwriter's draft appears here"
            aria-label="The Ghostwriter's draft"
          />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" disabled={!output.trim()} onClick={() => onAppend(output)}>
              Push into the scene
            </Button>
            <Button size="sm" variant="outline" disabled={!output.trim()} onClick={() => onReplace(output)}>
              Replace the scene
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Only a push changes your manuscript.</p>
        </div>
      </div>
    </aside>
  );
}
