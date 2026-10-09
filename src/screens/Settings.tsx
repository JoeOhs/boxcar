import { useState, type ReactNode } from "react";
import { Check, ImageIcon, KeyRound, ShieldCheck } from "lucide-react";
import type { AiProvider, ApiKeyKind, StoredApiKey } from "@/db/schema";
import { askAi, DEFAULT_MODEL, PROVIDER_LABEL } from "@/lib/ai";
import { DEFAULT_IMAGE_MODEL, IMAGE_PROVIDER_LABEL } from "@/lib/imageAi";
import { useOnline } from "@/lib/hooks";
import { addApiKey, deleteApiKey, revokeApiKey, setApiKeyModel, selectApiKey, useApiKeys } from "@/lib/keyVault";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface KeyManagerProps {
  kind: ApiKeyKind;
  title: string;
  icon: ReactNode;
  intro: string;
  providers: Record<string, string>;
  defaultModels: Record<string, string>;
  keyHints: Record<string, string>;
  modelLabel: string;
  /** Text keys can be tried against the provider before they are relied on. */
  canTest: boolean;
}

/** Adds, lists, switches, revokes and deletes the stored keys of one kind. Keys are encrypted on save and never shown again. */
function KeyManager({ kind, title, icon, intro, providers, defaultModels, keyHints, modelLabel, canTest }: KeyManagerProps) {
  const online = useOnline();
  const list = useApiKeys(kind);
  const providerIds = Object.keys(providers);
  const [provider, setProvider] = useState(providerIds[0]);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(defaultModels[providerIds[0]]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function changeProvider(next: string) {
    // Swap the model only if the author has not typed their own.
    if (model === defaultModels[provider]) setModel(defaultModels[next]);
    setProvider(next);
    setMessage(null);
  }

  async function save(thenTest: boolean) {
    const plain = apiKey.trim();
    setBusy(true);
    setMessage(null);
    try {
      const chosenModel = model.trim() || defaultModels[provider];
      await addApiKey(kind, { provider, model: chosenModel, apiKey: plain });
      // The plain key leaves the form as soon as it has been encrypted and stored.
      setApiKey("");
      if (!thenTest) {
        setMessage({ ok: true, text: "Encrypted and saved on this computer." });
      } else {
        try {
          await askAi(
            { provider: provider as AiProvider, apiKey: plain, model: chosenModel },
            "Reply with the single word: ready",
            [{ role: "user", content: "Are you there?" }],
          );
          setMessage({ ok: true, text: "Saved, and connected. The AI staff are ready." });
        } catch (e) {
          setMessage({ ok: false, text: `Saved, but the test failed: ${e instanceof Error ? e.message : "unknown error"}` });
        }
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "The key could not be saved." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: StoredApiKey) {
    if (!window.confirm(`Revoke the ${providers[row.provider] ?? row.provider} key ending ${row.tail}? It is wiped from this computer and the app can no longer use it.`)) return;
    await revokeApiKey(row.id);
    setMessage({ ok: true, text: "Key revoked and wiped from this computer. To stop the provider accepting it anywhere, revoke it in the provider's dashboard too." });
  }

  async function remove(row: StoredApiKey) {
    if (!window.confirm(`Delete the ${providers[row.provider] ?? row.provider} key ending ${row.tail} from the list?`)) return;
    await deleteApiKey(row.id);
    setMessage({ ok: true, text: "Key deleted." });
  }

  return (
    <Card className="max-w-xl space-y-4 p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-medium">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{intro}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${kind}-provider`}>Provider</Label>
          <Select id={`${kind}-provider`} value={provider} onChange={(e) => changeProvider(e.target.value)}>
            {providerIds.map((p) => (
              <option key={p} value={p}>
                {providers[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${kind}-model`}>{modelLabel}</Label>
          <Input id={`${kind}-model`} value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${kind}-key`}>{providers[provider]} API key</Label>
        <Input
          id={`${kind}-key`}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          hint={keyHints[provider]}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button disabled={!apiKey.trim() || busy} onClick={() => void save(false)}>
          Save key
        </Button>
        {canTest ? (
          <Button variant="outline" disabled={!apiKey.trim() || busy || !online} onClick={() => void save(true)}>
            {busy ? "Working..." : "Save and test"}
          </Button>
        ) : null}
      </div>
      {canTest && !online ? <p className="text-sm text-muted-foreground">You are offline, so a key cannot be tested right now.</p> : null}
      {message ? (
        <p className={"flex items-start gap-1.5 text-sm " + (message.ok ? "text-success" : "text-destructive")}>
          {message.ok ? <Check className="mt-0.5 size-4 shrink-0" /> : null}
          {message.text}
        </p>
      ) : null}

      <div className="space-y-2 border-t border-border pt-4">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Stored keys
        </h3>
        {list === undefined ? null : list.keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys stored yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.keys.map((row) => {
              const revoked = row.status === "revoked";
              const inUse = row.id === list.inUseId;
              return (
                <li key={row.id} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{providers[row.provider] ?? row.provider}</span>
                    <code className="text-xs text-muted-foreground">{revoked ? "wiped" : `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${row.tail}`}</code>
                    {revoked ? (
                      <Badge variant="destructive">Revoked</Badge>
                    ) : inUse ? (
                      <Badge variant="success">In use</Badge>
                    ) : (
                      <Badge variant="outline">Stored</Badge>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {revoked && row.revokedAt
                        ? `Revoked ${new Date(row.revokedAt).toLocaleDateString()}`
                        : `Added ${new Date(row.createdAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {revoked ? null : (
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`model-${row.id}`} className="shrink-0 text-xs text-muted-foreground">
                        {modelLabel}
                      </Label>
                      <Input
                        key={row.model}
                        id={`model-${row.id}`}
                        defaultValue={row.model}
                        className="h-8 text-xs"
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== row.model) void setApiKeyModel(row.id, e.target.value);
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {!revoked && !inUse ? (
                      <Button size="sm" variant="outline" onClick={() => void selectApiKey(row)}>
                        Use this key
                      </Button>
                    ) : null}
                    {!revoked ? (
                      <Button size="sm" variant="outline" onClick={() => void revoke(row)}>
                        Revoke
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => void remove(row)}>
                      Delete
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
export function Settings() {
  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Settings" description="Your AI keys for the AI staff and the Book Cover workshop, and where your data lives." />
      <div className="space-y-6 overflow-y-auto p-6">
        <KeyManager
          kind="text"
          title="AI staff"
          icon={<KeyRound className="size-4 text-muted-foreground" />}
          intro="The outliner, editor, proofreader, formatter and ghostwriter run on your own account with an AI provider. Your key is encrypted before it is stored on this computer, is never shown again after you save it, and is sent only to the provider you choose. Writing, outlining and exporting never need it."
          providers={PROVIDER_LABEL}
          defaultModels={DEFAULT_MODEL}
          keyHints={{ openai: "sk-...", anthropic: "sk-ant-..." }}
          modelLabel="Model"
          canTest
        />
        <KeyManager
          kind="image"
          title="Book Cover image AI"
          icon={<ImageIcon className="size-4 text-muted-foreground" />}
          intro="The Book Cover workshop makes pictures with an image-generating model, so it needs a key from a provider that offers one. This is separate from the AI staff key above, because not every text provider makes images. The key is encrypted before it is stored on this computer. Each picture is billed by the provider to your account."
          providers={IMAGE_PROVIDER_LABEL}
          defaultModels={DEFAULT_IMAGE_MODEL}
          keyHints={{ openai: "sk-...", google: "AIza..." }}
          modelLabel="Image model"
          canTest={false}
        />
        <Card className="max-w-xl space-y-2 p-5">
          <h2 className="text-sm font-medium">Your data</h2>
          <p className="text-sm text-muted-foreground">
            There is no account and no server. Everything lives in this app's local storage on your computer. Use Export
            to keep a copy of a finished book.
          </p>
        </Card>
      </div>
    </div>
  );
}