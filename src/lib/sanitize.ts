/**
 * Cleans HTML that came from outside the editor (an AI reply) before it is stored
 * or exported. Elements that can run or load anything are removed, along with
 * inline styles, event handlers and links whose address is not a safe one.
 */

const DANGEROUS = "script,style,iframe,frame,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,template";
const URL_ATTRIBUTES = ["href", "src", "xlink:href", "action", "formaction", "srcset", "poster", "background"];

/**
 * True when a link address may be kept. Addresses that could run code when
 * clicked (javascript:, data:, vbscript: and the like) must return false.
 */
export function isSafeUrl(value: string): boolean {
  // Browsers skip whitespace and control characters inside a scheme ("java\nscript:"), so do the same before checking.
  const cleaned = value.replace(/[\u0000- \u007f-\u009f]/g, "").toLowerCase();
  if (!cleaned) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(cleaned)?.[1];
  // No scheme: an anchor or a relative address, which cannot run anything.
  if (scheme === undefined) return true;
  return SAFE_SCHEMES.has(scheme);
}

const SAFE_SCHEMES = new Set(["http", "https", "mailto"]);

/** Removes anything that could run or restyle the page from a parsed document's body. */
export function sanitizeDocument(doc: Document): void {
  doc.body.querySelectorAll(DANGEROUS).forEach((node) => node.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    el.removeAttribute("style");
    for (const name of el.getAttributeNames()) {
      if (name.toLowerCase().startsWith("on")) el.removeAttribute(name);
      else if (URL_ATTRIBUTES.includes(name.toLowerCase()) && !isSafeUrl(el.getAttribute(name) ?? "")) el.removeAttribute(name);
    }
  });
}

/** The same cleaning for an HTML string. */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeDocument(doc);
  return doc.body.innerHTML;
}
