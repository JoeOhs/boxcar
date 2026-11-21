import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, Copy, Orbit, Reply, Send, Sparkles, Trash2, WifiOff, X } from "lucide-react";
import { db, newId, type AgentMessage, type AgentRole, type Id } from "@/db/schema";
import { aiReachable, AGENT_LABEL, askAi, systemPrompt, useAiSettings, type ChatTurn } from "@/lib/ai";
import { createCorkNote } from "@/lib/corkboard";
import { useOnline } from "@/lib/hooks";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  manuscriptId: Id;
  role: AgentRole;
  /** Describes the manuscript for the AI; called each time a message is sent. */
  getContext: () => string | Promise<string>;
  /** Ready-made questions shown as buttons. */
  quickPrompts?: { label: string; prompt: string }[];
  /** Replaces the role's usual brief, e.g. for one editing pass. */
  persona?: string;
  /** Model to use instead of the one chosen in Settings, e.g. the model picked for an editing pass. */
  model?: string;
  /** Optional button on each reply, e.g. to copy it into the outline notes. */
  onUseReply?: { label: string; run: (text: string) => void };
  /** A question to start the message box with, e.g. a flag pushed from the developmental report. */
  initialText?: string;
}

/** A conversation with one AI role, saved per manuscript so it can be read offline. */
export function AgentChat({ manuscriptId, role, getContext, persona, model, quickPrompts, onUseReply, initialText }: Props) {
  const { navigate } = useApp();
  const ai = useAiSettings();
  const online = useOnline();
  const reachable = aiReachable(ai, online);
  const [draft, setDraft] = useState(initialText ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  /** The reply the author is answering, quoted above the message box. */
  const [replyTo, setReplyTo] = useState<AgentMessage | null>(null);
  /** Brief confirmation on a bubble after Copy or Send to Universe. */
  const [done, setDone] = useState<{ id: Id; what: "copied" | "pinned" } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = useLiveQuery(
    async () => {
      const rows = await db.agentMessages.where("manuscriptId").equals(manuscriptId).filter((m) => m.role === role).toArray();
      return rows.sort((a, b) => a.createdAt - b.createdAt);
    },
    [manuscriptId, role],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, busy]);

  function flash(id: Id, what: "copied" | "pinned") {
    setDone({ id, what });
    window.setTimeout(() => setDone((current) => (current?.id === id && current.what === what ? null : current)), 1600);
  }

  async function copy(m: AgentMessage) {
    try {
      await navigator.clipboard.writeText(m.text);
      flash(m.id, "copied");
    } catch {
      setError("The reply could not be copied. Select the text and copy it by hand.");
    }
  }

  async function sendToUniverse(m: AgentMessage) {
    await createCorkNote(manuscriptId, m.text, role);
    flash(m.id, "pinned");
  }

  function startReply(m: AgentMessage) {
    setReplyTo(m);
    inputRef.current?.focus();
  }

  async function send(text: string, quoting: AgentMessage | null = null) {
    const typed = text.trim();
    if (!typed || !ai || busy) return;
    // A reply carries the passage it answers as a quote, so the AI knows what "this" refers to.
    const content = quoting ? quoteOf(quoting.text) + "\n\n" + typed : typed;
    setBusy(true);
    setError(null);
    const userMessage: AgentMessage = {
      id: newId(),
      manuscriptId,
      role,
      from: "user",
      text: content,
      createdAt: Date.now(),
    };
    try {
      await db.agentMessages.add(userMessage);
      setDraft("");
      setReplyTo(null);
      const history = [...(messages ?? []), userMessage].slice(-12);
      const turns: ChatTurn[] = history.map((m) => ({
        role: m.from === "user" ? "user" : "assistant",
        content: m.text,
      }));
      while (turns.length > 0 && turns[0].role !== "user") turns.shift();
      const reply = await askAi(model ? { ...ai, model } : ai, systemPrompt(role, await getContext(), persona), turns);
      await db.agentMessages.add({
        id: newId(),
        manuscriptId,
        role,
        from: "agent",
        text: reply,
        createdAt: Date.now(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm(`Clear your conversation with the ${AGENT_LABEL[role]}?`)) return;
    const ids = await db.agentMessages.where("manuscriptId").equals(manuscriptId).filter((m) => m.role === role).primaryKeys();
    await db.agentMessages.bulkDelete(ids);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-muted-foreground" />
          {AGENT_LABEL[role]}
        </div>
        {messages && messages.length > 0 ? (
          <Button variant="ghost" size="icon" title="Clear conversation" onClick={() => void clear()}>
            <Trash2 />
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {messages?.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ask the {AGENT_LABEL[role].toLowerCase()} anything about this book.
          </p>
        ) : null}
        {messages?.map((m) => (
          <div key={m.id} className={m.from === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.from === "user"
                  ? "max-w-[90%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "max-w-[95%] rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              <div className="whitespace-pre-wrap">{m.text}</div>
              {m.from === "agent" && onUseReply ? (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => onUseReply.run(m.text)}>
                  {onUseReply.label}
                </Button>
              ) : null}
              {m.from === "agent" ? (
                <div className="-mb-1 mt-1.5 flex items-center gap-0.5 text-muted-foreground">
                  <BubbleAction title="Copy" onClick={() => void copy(m)}>
                    {done?.id === m.id && done.what === "copied" ? <Check /> : <Copy />}
                  </BubbleAction>
                  <BubbleAction title="Reply to this" onClick={() => startReply(m)}>
                    <Reply />
                  </BubbleAction>
                  <BubbleAction title="Send to Universe (pins it to the Cork board)" onClick={() => void sendToUniverse(m)}>
                    {done?.id === m.id && done.what === "pinned" ? <Check /> : <Orbit />}
                  </BubbleAction>
                  {done?.id === m.id ? (
                    <span className="ml-1 text-[11px]">{done.what === "copied" ? "Copied" : "Pinned to the Cork board"}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {busy ? <p className="text-sm text-muted-foreground">The {AGENT_LABEL[role].toLowerCase()} is thinking...</p> : null}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-border p-3">
        {ai === null ? (
          <p className="text-sm text-muted-foreground">
            The AI staff use your own AI key.{" "}
            <button className="underline" onClick={() => navigate("settings")}>
              Add it in Settings
            </button>
            .
          </p>
        ) : null}
        {!reachable ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <WifiOff className="size-4" /> Offline. You can read past conversations; asking needs a connection.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {quickPrompts && ai ? (
          <div className="flex flex-wrap gap-1.5">
            {quickPrompts.map((q) => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                disabled={busy || !reachable}
                onClick={() => void send(q.prompt)}
              >
                {q.label}
              </Button>
            ))}
          </div>
        ) : null}
        {replyTo ? (
          <div className="flex items-start gap-2 rounded-md border-l-2 border-primary bg-muted px-2 py-1.5 text-xs text-muted-foreground">
            <Reply className="mt-0.5 size-3 shrink-0" />
            <span className="line-clamp-2 min-w-0 flex-1">{excerpt(replyTo.text)}</span>
            <button type="button" title="Cancel the reply" aria-label="Cancel the reply" onClick={() => setReplyTo(null)}>
              <X className="size-3" />
            </button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft, replyTo);
              }
              if (e.key === "Escape" && replyTo) setReplyTo(null);
            }}
            hint={`Message the ${AGENT_LABEL[role].toLowerCase()}`}
            className="min-h-10 resize-none"
            rows={2}
            disabled={!ai}
          />
          <Button size="icon" title="Send" disabled={!ai || busy || !reachable || !draft.trim()} onClick={() => void send(draft, replyTo)}>
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** A small icon button under an AI reply. */
function BubbleAction({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded p-1 transition-colors hover:bg-background hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

/** The start of a reply, on one line, for the quote above the message box. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? flat.slice(0, 157).trimEnd() + "..." : flat;
}

/** The quoted passage put in front of the author's answer. */
function quoteOf(text: string): string {
  return "> " + excerpt(text);
}
