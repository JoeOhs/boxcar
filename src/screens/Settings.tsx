import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ImageIcon, KeyRound } from "lucide-react";
import {
  getAiSettings,
  getImageAiSettings,
  saveAiSettings,
  saveImageAiSettings,
  type AiProvider,
  type AiSettings,
  type ImageAiSettings,
  type ImageProvider,
} from "@/db/schema";
import { askAi, DEFAULT_MODEL, PROVIDER_LABEL } from "@/lib/ai";
import { DEFAULT_IMAGE_MODEL, IMAGE_PROVIDER_LABEL } from "@/lib/imageAi";
import { useOnline } from "@/lib/hooks";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

function AiKeyForm({ saved }: { saved: AiSettings | null }) {
  const online = useOnline();
  const [provider, setProvider] = useState<AiProvider>(saved?.provider ?? "anthropic");
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [model, setModel] = useState(saved?.model ?? DEFAULT_MODEL[saved?.provider ?? "anthropic"]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const current: AiSettings = { provider, apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL[provider] };

  function changeProvider(next: AiProvider) {
    // Swap the model only if the author has not typed their own.
    if (model === DEFAULT_MODEL[provider]) setModel(DEFAULT_MODEL[next]);
    setProvider(next);
    setMessage(null);
  }

  async function save() {
    await saveAiSettings(current);
    setMessage({ ok: true, text: current.apiKey ? "Saved on this computer." : "Key removed." });
  }

  async function test() {
    setTesting(true);
    setMessage(null);
    try {
      await saveAiSettings(current);
      await askAi(current, "Reply with the single word: ready", [{ role: "user", content: "Are you there?" }]);
      setMessage({ ok: true, text: "Connected. The AI staff are ready." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "The test failed." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card className="max-w-xl space-y-4 p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">AI staff</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        The outliner, editor, proofreader and formatter run on your own account with an AI provider. Your key is stored
        only on this computer and is sent only to the provider you choose. Writing, outlining and exporting never need
        it.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ai-provider">Provider</Label>
          <Select id="ai-provider" value={provider} onChange={(e) => changeProvider(e.target.value as AiProvider)}>
            {(Object.keys(PROVIDER_LABEL) as AiProvider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ai-model">Model</Label>
          <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="ai-key">{PROVIDER_LABEL[provider]} API key</Label>
        <Input
          id="ai-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          hint={provider === "openai" ? "sk-..." : "sk-ant-..."}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => void save()}>Save</Button>
        <Button variant="outline" disabled={!apiKey.trim() || testing || !online} onClick={() => void test()}>
          {testing ? "Testing..." : "Save and test"}
        </Button>
      </div>
      {!online ? <p className="text-sm text-muted-foreground">You are offline, so the key cannot be tested right now.</p> : null}
      {message ? (
        <p className={"flex items-center gap-1.5 text-sm " + (message.ok ? "text-success" : "text-destructive")}>
          {message.ok ? <Check className="size-4" /> : null}
          {message.text}
        </p>
      ) : null}
    </Card>
  );
}

function ImageKeyForm({ saved }: { saved: ImageAiSettings | null }) {
  const [provider, setProvider] = useState<ImageProvider>(saved?.provider ?? "openai");
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [model, setModel] = useState(saved?.model ?? DEFAULT_IMAGE_MODEL[saved?.provider ?? "openai"]);
  const [message, setMessage] = useState<string | null>(null);

  function changeProvider(next: ImageProvider) {
    // Swap the model only if the author has not typed their own.
    if (model === DEFAULT_IMAGE_MODEL[provider]) setModel(DEFAULT_IMAGE_MODEL[next]);
    setProvider(next);
    setMessage(null);
  }

  async function save() {
    const key = apiKey.trim();
    await saveImageAiSettings({ provider, apiKey: key, model: model.trim() || DEFAULT_IMAGE_MODEL[provider] });
    setMessage(key ? "Saved on this computer." : "Key removed.");
  }

  return (
    <Card className="max-w-xl space-y-4 p-5">
      <div className="flex items-center gap-2">
        <ImageIcon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Book Cover image AI</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        The Book Cover workshop makes pictures with an image-generating model, so it needs a key from a provider that
        offers one. This is separate from the AI staff key above, because not every text provider makes images. The key
        is stored only on this computer. Each picture is billed by the provider to your account.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="img-provider">Provider</Label>
          <Select id="img-provider" value={provider} onChange={(e) => changeProvider(e.target.value as ImageProvider)}>
            {(Object.keys(IMAGE_PROVIDER_LABEL) as ImageProvider[]).map((p) => (
              <option key={p} value={p}>
                {IMAGE_PROVIDER_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="img-model">Image model</Label>
          <Input id="img-model" value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="img-key">{IMAGE_PROVIDER_LABEL[provider]} API key</Label>
        <Input
          id="img-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          hint={provider === "openai" ? "sk-..." : "AIza..."}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => void save()}>Save</Button>
      </div>
      {message ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <Check className="size-4" />
          {message}
        </p>
      ) : null}
    </Card>
  );
}

export function Settings() {
  // undefined while loading; null when nothing has been saved yet.
  const saved = useLiveQuery(async () => (await getAiSettings()) ?? null, []);
  const savedImage = useLiveQuery(async () => (await getImageAiSettings()) ?? null, []);

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader title="Settings" description="Your AI keys for the AI staff and the Book Cover workshop, and where your data lives." />
      <div className="space-y-6 overflow-y-auto p-6">
        {saved === undefined ? null : <AiKeyForm saved={saved} />}
        {savedImage === undefined ? null : <ImageKeyForm saved={savedImage} />}
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
