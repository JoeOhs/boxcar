/** How long a request to an AI, image or speech provider may take before it is given up. */
export const REQUEST_TIMEOUT_MS = 120_000;

/** Thrown when a provider did not answer in time, so callers can tell it apart from a network failure. */
export class RequestTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} did not answer within ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds. Try again, or pick a faster model.`);
    this.name = "RequestTimeoutError";
  }
}

/**
 * fetch with a time limit. `what` names the service in the message, e.g. "The AI provider".
 * The body is read inside the time limit too, so a reply that stalls halfway also ends.
 */
export async function fetchWithTimeout(
  what: string,
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    // Buffer the body while the timer still runs, then hand back a complete response.
    const body = await response.arrayBuffer();
    const noBody = response.status === 204 || response.status === 205 || response.status === 304;
    return new Response(noBody ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (e) {
    if (controller.signal.aborted) throw new RequestTimeoutError(what);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How long a streamed AI reply may go completely silent before it is given up. Reasoning
 * models can think for minutes before their first word, so this is generous; a reply that
 * keeps arriving is never cut off by it.
 */
export const STREAM_SILENCE_MS = 300_000;

/** The longest any streamed reply may take in total, so a reply that trickles forever still ends. */
export const STREAM_TOTAL_MS = 30 * 60_000;

/** Thrown when a streamed reply went silent for too long, or ran past the total limit. */
export class StreamTimeoutError extends RequestTimeoutError {
  constructor(what: string, total: boolean) {
    super(what);
    this.message = total
      ? `${what} was still writing after ${Math.round(STREAM_TOTAL_MS / 60_000)} minutes, so the request was stopped. Try again, or pick a faster model.`
      : `${what} sent nothing for ${Math.round(STREAM_SILENCE_MS / 60_000)} minutes. Try again, or pick a faster model.`;
  }
}

/**
 * fetch for a streamed reply. Unlike fetchWithTimeout, the clock restarts every time a piece
 * of the reply arrives, so a slow model that is still writing is never cut off; only silence
 * (or the total limit) ends it. Returns the whole body as text.
 */
export async function fetchStreamText(
  what: string,
  url: string,
  init: RequestInit,
  silenceMs = STREAM_SILENCE_MS,
  totalMs = STREAM_TOTAL_MS,
): Promise<{ response: Response; text: string }> {
  const controller = new AbortController();
  let reason: "silence" | "total" | null = null;
  let silence = setTimeout(() => stop("silence"), silenceMs);
  const total = setTimeout(() => stop("total"), totalMs);
  function stop(why: "silence" | "total") {
    reason = why;
    controller.abort();
  }
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    let text = "";
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        // Something arrived: the provider is still working, so the silence clock starts again.
        clearTimeout(silence);
        silence = setTimeout(() => stop("silence"), silenceMs);
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } else {
      text = await response.text();
    }
    return { response, text };
  } catch (e) {
    if (reason) throw new StreamTimeoutError(what, reason === "total");
    throw e;
  } finally {
    clearTimeout(silence);
    clearTimeout(total);
  }
}
