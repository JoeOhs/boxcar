import { useLiveQuery } from "dexie-react-hooks";
import { getImageAiSettings, type CoverBrief, type ImageAiSettings, type ImageProvider } from "@/db/schema";
import { CATEGORY_LABEL, type Genre } from "./genres";

/**
 * Image generation for the Book Cover workshop. Like the text AI staff it runs on
 * the author's own key, sent straight from this computer to the provider they
 * chose. Anthropic has no image model, so the image key is kept apart from the
 * text key in Settings.
 */

export const IMAGE_PROVIDER_LABEL: Record<ImageProvider, string> = {
  openai: "OpenAI",
  google: "Google Gemini",
};

export const DEFAULT_IMAGE_MODEL: Record<ImageProvider, string> = {
  openai: "gpt-image-1",
  google: "gemini-2.5-flash-image",
};

/** The looks the author can pick from in the workshop. */
export const COVER_STYLES: { id: string; label: string; prompt: string }[] = [
  { id: "illustrated", label: "Illustrated", prompt: "a detailed hand-illustrated digital artwork" },
  { id: "painterly", label: "Painterly", prompt: "a rich painterly artwork with visible brush texture" },
  { id: "photographic", label: "Photographic", prompt: "a striking, professionally lit photograph" },
  { id: "cinematic", label: "Cinematic", prompt: "a dramatic cinematic digital artwork, like a film poster" },
  { id: "minimal", label: "Minimal", prompt: "a minimalist graphic design with simple shapes and generous empty space" },
  { id: "typographic", label: "Typographic", prompt: "a bold typographic design in which the lettering is the main image" },
  { id: "vintage", label: "Vintage", prompt: "a vintage printed-paperback look with textured paper and limited inks" },
];

export const DEFAULT_COVER_BRIEF: CoverBrief = {
  style: "illustrated",
  subject: "",
  palette: "",
  extra: "",
  lettering: false,
};

/** The author's image key. undefined while loading, null when none has been saved. */
export function useImageAiSettings(): ImageAiSettings | null | undefined {
  return useLiveQuery(async () => {
    const settings = await getImageAiSettings();
    return settings && settings.apiKey.trim() ? settings : null;
  }, []);
}

export interface CoverPromptInput {
  title: string;
  subtitle: string;
  author: string;
  genre: Genre | undefined;
  brief: CoverBrief;
}

/** Turns the author's brief into the full prompt for the image model. */
export function buildCoverPrompt({ title, subtitle, author, genre, brief }: CoverPromptInput): string {
  const style = COVER_STYLES.find((s) => s.id === brief.style) ?? COVER_STYLES[0];
  const kind = genre ? `${CATEGORY_LABEL[genre.category].toLowerCase()} ${genre.label.toLowerCase()}` : "";
  const lines = [
    `A professional front cover for a ${kind ? `${kind} ` : ""}book titled "${title.trim() || "Untitled"}".`,
    "Portrait orientation, 2:3 ratio. Show only the flat cover artwork, edge to edge: no book mockup, no 3D, no frame or border.",
    `Style: ${style.prompt}.`,
  ];
  if (genre) lines.push(`Genre conventions for the look: ${genre.coverLook}.`);
  if (brief.subject.trim()) lines.push(`The cover shows: ${brief.subject.trim()}.`);
  if (brief.palette.trim()) lines.push(`Colours and mood: ${brief.palette.trim()}.`);
  if (brief.extra.trim()) lines.push(brief.extra.trim());
  if (brief.lettering) {
    const sub = subtitle.trim() ? ` and the subtitle "${subtitle.trim()}"` : "";
    lines.push(
      `Letter the title "${title.trim() || "Untitled"}"${sub} and the author name "${author.trim()}" on the cover, large, legible and spelled exactly as written.`,
    );
  } else {
    lines.push(
      "Do not draw any text, letters or words. Keep calm space near the top for the title and near the bottom for the author name.",
    );
  }
  return lines.join(" ");
}

interface ErrorBody {
  error?: { message?: string } | string;
}

interface OpenAiImageBody extends ErrorBody {
  data?: { b64_json?: string; url?: string }[];
}

interface GeminiImageBody extends ErrorBody {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
        inline_data?: { mime_type?: string; data?: string };
      }[];
    };
  }[];
  promptFeedback?: { blockReason?: string };
}

function errorText(body: ErrorBody | null, status: number, statusText: string): string {
  const err = body?.error;
  const message = typeof err === "string" ? err : err?.message;
  return message ? message : `The image provider answered ${status} ${statusText}`.trim();
}

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Sizes the OpenAI image models accept, as tall as each allows. */
function openAiRequestFor(model: string, prompt: string): Record<string, unknown> {
  if (model.startsWith("dall-e-3")) return { model, prompt, n: 1, size: "1024x1792", response_format: "b64_json" };
  if (model.startsWith("dall-e-2")) return { model, prompt: prompt.slice(0, 1000), n: 1, size: "1024x1024", response_format: "b64_json" };
  return { model, prompt, n: 1, size: "1024x1536" };
}

/** Asks the author's image model for one cover picture and returns it as an image file. */
export async function generateCoverImage(settings: ImageAiSettings, prompt: string): Promise<Blob> {
  if (!navigator.onLine) {
    throw new Error("You are offline. Making a cover picture needs a connection; everything else keeps working.");
  }
  const key = settings.apiKey.trim();
  if (!key) throw new Error("Add your image AI key in Settings first.");
  const model = settings.model.trim() || DEFAULT_IMAGE_MODEL[settings.provider];

  let response: Response;
  try {
    if (settings.provider === "openai") {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(openAiRequestFor(model, prompt)),
      });
    } else {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
    }
  } catch {
    throw new Error("Could not reach the image provider. Check your connection and try again.");
  }

  if (settings.provider === "openai") {
    const body = (await response.json().catch(() => null)) as OpenAiImageBody | null;
    if (!response.ok) throw new Error(errorText(body, response.status, response.statusText));
    const first = body?.data?.[0];
    if (first?.b64_json) return base64ToBlob(first.b64_json, "image/png");
    if (first?.url) {
      const image = await fetch(first.url).catch(() => null);
      if (image?.ok) return image.blob();
    }
    throw new Error("The image provider sent back no picture.");
  }

  const body = (await response.json().catch(() => null)) as GeminiImageBody | null;
  if (!response.ok) throw new Error(errorText(body, response.status, response.statusText));
  const parts = body?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = part.inlineData ?? part.inline_data;
    const data = inline?.data;
    if (data) {
      const type = (part.inlineData?.mimeType ?? part.inline_data?.mime_type) || "image/png";
      return base64ToBlob(data, type);
    }
  }
  const said = parts.map((p) => p.text).filter(Boolean).join(" ").trim();
  throw new Error(
    said || (body?.promptFeedback?.blockReason ? `The image provider refused the request (${body.promptFeedback.blockReason}).` : "The image provider sent back no picture."),
  );
}
