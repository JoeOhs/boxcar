import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square, X } from "lucide-react";
import { getAiSettings } from "@/lib/keyVault";
import {
  AI_VOICES,
  browserVoiceAvailable,
  DEFAULT_AI_VOICE,
  ENGINE_LABEL,
  NEEDS_OPENAI_KEY,
  speakWithBrowser,
  synthesizeParagraphs,
  type VoiceEngine,
} from "@/lib/narration";
import { useApp } from "@/state/AppState";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

type Status = "idle" | "playing" | "paused" | "making";

/**
 * The listening bar in Write: reads the open chapter aloud so the author can hear
 * the manuscript before it is published. "This computer's voice" works offline;
 * "AI voice" uses the author's OpenAI key, the same voice the audiobook uses.
 */
export function Narrator({ paragraphs, language, onClose }: { paragraphs: string[]; language: string; onClose: () => void }) {
  const { online } = useApp();
  const [engine, setEngine] = useState<VoiceEngine>(browserVoiceAvailable() ? "browser" : "ai");
  const [voice, setVoice] = useState(DEFAULT_AI_VOICE);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const speech = useRef<{ stop: () => void; pause: () => void; resume: () => void } | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const playerUrl = useRef<string | null>(null);

  function releasePlayer() {
    player.current?.pause();
    player.current = null;
    if (playerUrl.current) URL.revokeObjectURL(playerUrl.current);
    playerUrl.current = null;
  }

  function stop() {
    speech.current?.stop();
    speech.current = null;
    releasePlayer();
    setStatus("idle");
  }

  // Leaving the screen (or the chapter) must not leave a voice talking.
  useEffect(() => {
    return () => {
      speech.current?.stop();
      releasePlayer();
    };
  }, []);

  function changeEngine(next: VoiceEngine) {
    stop();
    setError(null);
    setEngine(next);
  }

  async function play() {
    setError(null);
    if (paragraphs.length === 0) {
      setError("There is no text in this chapter to read yet.");
      return;
    }
    if (engine === "browser") {
      if (status === "paused") {
        speech.current?.resume();
        setStatus("playing");
        return;
      }
      speech.current?.stop();
      speech.current = speakWithBrowser(paragraphs, language, () => {
        speech.current = null;
        setStatus("idle");
      });
      setStatus("playing");
      return;
    }

    if (status === "paused" && player.current) {
      await player.current.play();
      setStatus("playing");
      return;
    }
    const settings = await getAiSettings();
    if (!settings || settings.provider !== "openai") {
      setError(NEEDS_OPENAI_KEY);
      return;
    }
    if (!online) {
      setError("You are offline. The AI voice needs a connection; this computer's voice works without one.");
      return;
    }
    releasePlayer();
    setStatus("making");
    try {
      const blob = await synthesizeParagraphs(settings.apiKey, paragraphs, voice);
      const url = URL.createObjectURL(blob);
      playerUrl.current = url;
      const audio = new Audio(url);
      audio.onended = () => setStatus("idle");
      player.current = audio;
      await audio.play();
      setStatus("playing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI voice could not read this chapter.");
      setStatus("idle");
    }
  }

  function pause() {
    if (engine === "browser") speech.current?.pause();
    else player.current?.pause();
    setStatus("paused");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-6 py-2" role="region" aria-label="Listen to this chapter">
      <span className="text-xs font-medium">Listen</span>
      <Select
        className="h-8 w-44"
        aria-label="Voice"
        value={engine}
        onChange={(e) => changeEngine(e.target.value as VoiceEngine)}
      >
        {browserVoiceAvailable() ? <option value="browser">{ENGINE_LABEL.browser}</option> : null}
        <option value="ai">{ENGINE_LABEL.ai}</option>
      </Select>
      {engine === "ai" ? (
        <Select className="h-8 w-32" aria-label="AI voice" value={voice} onChange={(e) => setVoice(e.target.value)}>
          {AI_VOICES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      ) : null}
      {status === "playing" ? (
        <Button size="sm" variant="outline" onClick={pause}>
          <Pause /> Pause
        </Button>
      ) : (
        <Button size="sm" disabled={status === "making"} onClick={() => void play()}>
          <Play /> {status === "paused" ? "Resume" : "Play"}
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={status === "idle"} onClick={stop}>
        <Square /> Stop
      </Button>
      <span className="text-xs text-muted-foreground">{status === "making" ? "Making the AI voice..." : null}</span>
      {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
      <Button size="icon" variant="ghost" className="ml-auto" title="Close the listening bar" onClick={() => { stop(); onClose(); }}>
        <X />
      </Button>
    </div>
  );
}
