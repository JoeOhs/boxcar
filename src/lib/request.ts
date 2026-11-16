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
