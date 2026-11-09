import { useState } from "react";
import { Link2, Plus, Sparkles, Tag, Trash2 } from "lucide-react";
import type { Manuscript, UniverseField, UniverseNode, UniverseNodeKind } from "@/db/schema";
import { aiReachable, useAiSettings } from "@/lib/ai";
import { genreById, genreContext } from "@/lib/genres";
import { useOnline, useOutlineItems } from "@/lib/hooks";
import { outlineToText } from "@/lib/outline";
import {
  createUniverseNode,
  deleteUniverseNode,
  newField,
  nodeColor,
  patchUniverseNode,
  tagStyle,
  UNIVERSE_KIND_LABEL,
  UNIVERSE_KIND_PLURAL,
  UNIVERSE_KINDS,
  universeToText,
  useUniverseNodes,
  outlineFromUniverse,
  characterFields,
} from "@/lib/universe";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { AgentChat } from "@/components/AgentChat";
import { NoManuscript } from "@/components/NoManuscript";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Outline } from "@/screens/Outline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** The tags on one node, typed as a comma-separated list and saved when the field loses focus. */
function TagsField({ node }: { node: UniverseNode }) {
  const [text, setText] = useState(node.tags.join(", "));
  function save() {
    const tags = text
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    void patchUniverseNode(node.id, { tags });
  }
  return (
    <div className="space-y-1">
      <Label htmlFor="u-tags">Tags</Label>
      <Input
        id="u-tags"
        value={text}
        hint="magic, weapons, family"
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <p className="text-xs text-muted-foreground">Tags colour the node and group it with related nodes.</p>
      {node.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {node.tags.map((tag) => (
            <span key={tag} className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={tagStyle(tag)}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldsEditor({ node }: { node: UniverseNode }) {
  function change(fields: UniverseField[]) {
    void patchUniverseNode(node.id, { fields });
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Details</Label>
        <Button size="sm" variant="ghost" onClick={() => change([...node.fields, newField()])}>
          <Plus /> Add detail
        </Button>
      </div>
      {node.fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add any detail this node needs. A character starts with personality, clothing, handicaps and more; any other node
          can have its own.
        </p>
      ) : null}
      <div className="space-y-2">
        {node.fields.map((field) => (
          <div key={field.id} className="grid grid-cols-[11rem_1fr_auto] gap-2">
            <Input
              value={field.label}
              aria-label="Detail name"
              hint="e.g. Clothing preferences"
              onChange={(e) => change(node.fields.map((f) => (f.id === field.id ? { ...f, label: e.target.value } : f)))}
            />
            <Input
              value={field.value}
              aria-label={"Detail: " + (field.label || "detail")}
              onChange={(e) => change(node.fields.map((f) => (f.id === field.id ? { ...f, value: e.target.value } : f)))}
            />
            <Button
              size="icon"
              variant="ghost"
              title="Remove this detail"
              onClick={() => change(node.fields.filter((f) => f.id !== field.id))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeEditor({ node, nodes }: { node: UniverseNode; nodes: UniverseNode[] }) {
  const others = nodes.filter((other) => other.id !== node.id);
  function toggleLink(id: string) {
    const links = node.links.includes(id) ? node.links.filter((link) => link !== id) : [...node.links, id];
    void patchUniverseNode(node.id, { links });
  }
  return (
    <div className="max-w-3xl space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1">
          <Label htmlFor="u-name">Name</Label>
          <Input
            id="u-name"
            value={node.name}
            hint={UNIVERSE_KIND_LABEL[node.kind] + " name"}
            onChange={(e) => void patchUniverseNode(node.id, { name: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="u-kind">Kind</Label>
          <Select
            id="u-kind"
            value={node.kind}
            onChange={(e) => {
              const kind = e.target.value as UniverseNodeKind;
              const fields = kind === "character" && node.fields.length === 0 ? characterFields() : node.fields;
              void patchUniverseNode(node.id, { kind, fields });
            }}
          >
            {UNIVERSE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {UNIVERSE_KIND_LABEL[kind]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="u-summary">What this is</Label>
        <Textarea
          id="u-summary"
          rows={4}
          value={node.summary}
          hint="What it is, why it matters to the book, and anything the reader should understand."
          onChange={(e) => void patchUniverseNode(node.id, { summary: e.target.value })}
        />
      </div>
      <TagsField key={node.id + ":" + node.tags.join(",")} node={node} />
      <FieldsEditor node={node} />
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Link2 className="size-3.5" /> Connects to
        </Label>
        {others.length === 0 ? (
          <p className="text-xs text-muted-foreground">Make another node first, then connect it here.</p>
        ) : (
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
            {others.map((other) => (
              <label key={other.id} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/50">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
                  checked={node.links.includes(other.id)}
                  onChange={() => toggleLink(other.id)}
                />
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(other) ?? "var(--muted-foreground)" }} />
                <span className="min-w-0 truncate">
                  {other.name.trim() || "Untitled"} <span className="text-xs text-muted-foreground">({UNIVERSE_KIND_LABEL[other.kind]})</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function UniverseBody({ manuscript }: { manuscript: Manuscript }) {
  const nodes = useUniverseNodes(manuscript.id);
  const outlineItems = useOutlineItems(manuscript.id);
  const ai = useAiSettings();
  const online = useOnline();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<UniverseNodeKind>("character");
  const [showOutliner, setShowOutliner] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const selected = nodes?.find((node) => node.id === selectedId);
  const genre = genreById(manuscript.genre);

  async function add() {
    const created = await createUniverseNode(manuscript.id, newKind);
    setSelectedId(created.id);
  }

  async function remove(node: UniverseNode) {
    if (!window.confirm(`Delete "${node.name.trim() || "this node"}" from the Universe? Its links are removed too.`)) return;
    await deleteUniverseNode(node.id);
    setSelectedId(null);
  }

  async function buildOutline() {
    if (!ai || !nodes) return;
    setBusy(true);
    setNotice(null);
    try {
      const count = await outlineFromUniverse(ai, manuscript, nodes);
      setNotice({
        ok: true,
        text: `The Outliner added ${count} ${count === 1 ? "item" : "items"} to the outline. Open the Outline tab to read it.`,
      });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : "The Outliner could not build an outline." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title="Universe"
        description={`The second brain of ${manuscript.title}: characters, places, rules and things, connected by tags.`}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!nodes || nodes.length === 0 || busy || !ai || !aiReachable(ai, online)} onClick={() => void buildOutline()}>
              <Sparkles /> {busy ? "Building..." : "Generate outline from Universe"}
            </Button>
            <Button variant={showOutliner ? "secondary" : "outline"} size="sm" aria-pressed={showOutliner} onClick={() => setShowOutliner((open) => !open)}>
              <Sparkles /> Outliner
            </Button>
          </>
        }
      />
      {notice ? (
        <div className={cn("border-b border-border px-6 py-1.5 text-xs", notice.ok ? "bg-muted text-muted-foreground" : "text-destructive")}>
          {notice.text}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r border-border">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border p-2">
            <Select aria-label="Kind of new node" value={newKind} onChange={(e) => setNewKind(e.target.value as UniverseNodeKind)}>
              {UNIVERSE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {UNIVERSE_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
            <Button size="icon" title="Add a node to the Universe" onClick={() => void add()}>
              <Plus />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
            {nodes === undefined ? null : nodes.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                The Universe is empty. Add a character, a place, a situation, a rule, an item, a faction or an event, and build the
                world around it.
              </p>
            ) : (
              UNIVERSE_KINDS.map((kind) => {
                const group = nodes.filter((node) => node.kind === kind);
                if (group.length === 0) return null;
                return (
                  <div key={kind}>
                    <div className="mb-1 flex items-center justify-between px-2">
                      <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{UNIVERSE_KIND_PLURAL[kind]}</h2>
                      <span className="text-[11px] text-muted-foreground">{group.length}</span>
                    </div>
                    <div className="space-y-0.5">
                      {group.map((node) => (
                        <button
                          key={node.id}
                          onClick={() => setSelectedId(node.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            node.id === selectedId ? "bg-accent font-medium" : "hover:bg-accent/50",
                          )}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: nodeColor(node) ?? "var(--muted-foreground)" }} />
                          <span className="min-w-0 flex-1 truncate">{node.name.trim() || "Untitled"}</span>
                          {node.links.length > 0 ? <Link2 className="size-3 shrink-0 text-muted-foreground" /> : null}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="shrink-0 border-t border-border p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1">
              <Tag className="size-3" /> Tag a node "magic" or "weapons" to colour it and find its family.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline">{UNIVERSE_KIND_LABEL[selected.kind]}</Badge>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(selected)}>
                  <Trash2 /> Delete node
                </Button>
              </div>
              <NodeEditor key={selected.id} node={selected} nodes={nodes ?? []} />
            </div>
          ) : (
            <div className="max-w-md space-y-2 text-sm text-muted-foreground">
              <p>Select a node on the left to expand it, or add a new one.</p>
              <p>
                The Universe is the book's second brain. Characters can hold a personality type, clothing preferences and
                handicaps; places and situations hold what happens there; concepts hold the rules of the world. Tags such as
                "magic" or "weapons" colour related nodes. The Outliner reads all of it when you ask for an outline.
              </p>
              {genre ? <p>Genre guide: {genreContext(genre)}</p> : null}
            </div>
          )}
        </section>

        {showOutliner ? (
          <aside className="w-80 shrink-0 border-l border-border">
            <AgentChat
              manuscriptId={manuscript.id}
              role="outliner"
              getContext={() =>
                [
                  "Title: " + manuscript.title,
                  genreContext(genre),
                  manuscript.description ? "Description: " + manuscript.description : "",
                  nodes && nodes.length > 0 ? "THE UNIVERSE:\n" + universeToText(nodes) : "The Universe is empty.",
                  "THE OUTLINE SO FAR:\n" + outlineToText(outlineItems ?? []),
                  selected ? "Selected Universe node: " + UNIVERSE_KIND_LABEL[selected.kind] + " " + selected.name : "",
                ]
                  .filter(Boolean)
                  .join("\n\n")
              }
              quickPrompts={[
                { label: "Suggest an outline", prompt: "Using my Universe, suggest an outline for the book: acts, chapters and scenes, in order." },
                { label: "What is missing?", prompt: "Read my Universe and tell me what a reader would need that I have not built yet." },
              ]}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The Universe screen. Its first tab is the wiki-style second brain; the second
 * keeps the outline workshop, which the Outliner can fill from the Universe.
 */
export function Universe() {
  const { manuscript } = useApp();
  const [tab, setTab] = useState<"universe" | "outline">("universe");
  if (!manuscript) return <NoManuscript />;
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-1.5">
        <Button size="sm" variant={tab === "universe" ? "secondary" : "ghost"} aria-pressed={tab === "universe"} onClick={() => setTab("universe")}>
          Universe
        </Button>
        <Button size="sm" variant={tab === "outline" ? "secondary" : "ghost"} aria-pressed={tab === "outline"} onClick={() => setTab("outline")}>
          Outline
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "universe" ? <UniverseBody key={manuscript.id} manuscript={manuscript} /> : <Outline />}
      </div>
    </div>
  );
}
