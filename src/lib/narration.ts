import JSZip from "jszip";
import type { Chapter, HeadingStyle, Manuscript } from "@/db/schema";
import { chapterLabel, numberChapters, sortChapters } from "./chapters";
import { fileSafeName } from "./download";
import { NARRATION_MODEL } from "./providers";
import { htmlToText, textToParagraphs } from "./text";

/**
 * Reading the book aloud. Two voices:
 *  - "This computer": the browser's own speech voices. Free, offline, used for
 *    previewing the text in Write.
 *  - "AI voice": an OpenAI speech model, on the author's own OpenAI key. Used for the
 *    preview too, and for the audiobook export (one MP3 per chapter, in a zip).
 *
 * AI voice text is sent in pieces under the service's input limit, and the pieces
 * are joined into one MP3 for each chapter.
 */

export type VoiceEngine = "browser" | "ai";

export const ENGINE_LABEL: Record<VoiceEngine, string> = {
  browser: "This computer's voice",
  ai: "AI voice",
};

/** The voices the AI voice model offers. */
export const AI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];
export const DEFAULT_AI_VOICE = "alloy";

/** Characters sent to the AI voice in one request (the service accepts up to 4096). */
const SPEECH_PIECE = 3500;

/** Lines that are only punctuation, such as scene-break marks, are not read out. */
function isSpeakable(line: string): boolean {
  return /[\p{L}\p{N}]/u.test(line);
}

/** The text of one chapter, read aloud: its heading, then each paragraph. Empty for a chapter with no text. */
export function chapterSpeech(chapter: Chapter, number: number | undefined, style: HeadingStyle): string[] {
  const body = htmlSpeech(chapter.content);
  if (body.length === 0) return [];
  return [chapterLabel(chapter, number, style), ...body];
}

/** The paragraphs of some HTML (for example the scenes of an open chapter), read aloud. */
export function htmlSpeech(html: string): string[] {
  return textToParagraphs(htmlToText(html)).filter(isSpeakable);
}

/** Splits a paragraph that is longer than the limit at spaces, so no piece is too long for the service. */
function splitLong(text: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = text.trim();
  while (rest.length > limit) {
    let cut = rest.lastIndexOf(" ", limit);
    if (cut <= 0) cut = limit;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** Groups paragraphs into pieces that each fit the service's input limit. */
export function speechPieces(paragraphs: string[], limit = SPEECH_PIECE): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    for (const part of splitLong(paragraph, limit)) {
      const joined = current ? `${current}\n\n${part}` : part;
      if (joined.length > limit && current) {
        pieces.push(current);
        current = part;
      } else {
        current = joined;
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** One request to the AI voice: text in, MP3 out. */
export async function synthesizeSpeech(apiKey: string, input: string, voice: string): Promise<Blob> {
  if (!navigator.onLine) {
    throw new Error("You are offline. The AI voice needs a connection; this computer's voice works without one.");
  }
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: NARRATION_MODEL, input, voice, response_format: "mp3" }),
    });
  } catch {
    throw new Error("Could not reach the AI voice service. Check your connection and try again.");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `The AI voice service answered ${response.status} ${response.statusText}`.trim());
  }
  return new Blob([await response.arrayBuffer()], { type: "audio/mpeg" });
}

/** The AI voice reading a list of paragraphs, as one MP3. Pieces are read in order. */
export async function synthesizeParagraphs(apiKey: string, paragraphs: string[], voice: string): Promise<Blob> {
  const parts: Blob[] = [];
  for (const piece of speechPieces(paragraphs)) {
    parts.push(await synthesizeSpeech(apiKey, piece, voice));
  }
  if (parts.length === 0) throw new Error("There is no text to read yet.");
  return new Blob(parts, { type: "audio/mpeg" });
}

/** The AI voice key: the author's OpenAI key, which the speech model needs. */
export const NEEDS_OPENAI_KEY =
  "The AI voice uses an OpenAI key. Add one in Settings and make it the one in use, or listen with this computer's voice.";

/** Whether this browser can read text aloud at all. */
export function browserVoiceAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

/**
 * Reads paragraphs aloud with this computer's voice. Returns the controls: stop,
 * pause and resume. `onEnd` runs when the last paragraph has been read (not when stopped).
 */
export function speakWithBrowser(
  paragraphs: string[],
  language: string,
  onEnd: () => void,
): { stop: () => void; pause: () => void; resume: () => void } {
  const synth = window.speechSynthesis;
  synth.cancel();
  paragraphs.forEach((paragraph, index) => {
    const utterance = new SpeechSynthesisUtterance(paragraph);
    if (language) utterance.lang = language;
    if (index === paragraphs.length - 1) utterance.onend = () => onEnd();
    synth.speak(utterance);
  });
  return {
    stop: () => synth.cancel(),
    pause: () => synth.pause(),
    resume: () => synth.resume(),
  };
}

/**
 * The audiobook: one MP3 for each chapter that has text, read in the AI voice, in a
 * zip file. `onProgress` reports each chapter as it starts.
 */
export async function buildAudiobook(
  apiKey: string,
  manuscript: Manuscript,
  chaptersIn: Chapter[],
  voice: string,
  onProgress: (message: string) => void,
): Promise<Blob> {
  const chapters = sortChapters(chaptersIn);
  const numbers = numberChapters(chapters);
  const readable = chapters.filter((c) => chapterSpeech(c, numbers.get(c.id), manuscript.format.headingStyle).length > 0);
  if (readable.length === 0) throw new Error("There is no text to read yet. Write a chapter first.");

  const zip = new JSZip();
  for (let i = 0; i < readable.length; i++) {
    const chapter = readable[i];
    const label = chapterLabel(chapter, numbers.get(chapter.id), manuscript.format.headingStyle);
    onProgress(`Recording ${i + 1} of ${readable.length}: ${label}`);
    const paragraphs = chapterSpeech(chapter, numbers.get(chapter.id), manuscript.format.headingStyle);
    const mp3 = await synthesizeParagraphs(apiKey, paragraphs, voice);
    zip.file(`${String(i + 1).padStart(2, "0")} ${fileSafeName(label)}.mp3`, mp3);
  }
  onProgress("Packing the audiobook...");
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
