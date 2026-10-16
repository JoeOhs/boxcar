import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Send, Sparkles, Trash2, WifiOff } from "lucide-react";
import { db, newId, type AgentMessage, type AgentRole, type Id } from "@/db/schema";
import { aiReachable, AGENT_LABEL, askAi, systemPrompt, useAiSettings, type ChatTurn } from "@/lib/ai";
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
}

/** A conversation with one AI role, saved per manuscript so it can be read offline. */
export function AgentChat({ manuscriptId, role, getContext, persona, model, quickPrompts, onUseReply }: Props) {
  const { navigate } = useApp();
  const ai = useAiSettings();
  const online = useOnline();
  const reachable = aiReachable(ai, online);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

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

  async function send(text: string) {
    const content = text.trim();
    if (!content || !ai || busy) return;
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
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            hint={`Message the ${AGENT_LABEL[role].toLowerCase()}`}
            className="min-h-10 resize-none"
            rows={2}
            disabled={!ai}
          />
          <Button size="icon" title="Send" disabled={!ai || busy || !reachable || !draft.trim()} onClick={() => void send(draft)}>
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}
