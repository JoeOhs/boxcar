import { newId, type Id } from "@/db/schema";
import { countWords, escapeHtml } from "./text";

/**
 * A chapter is a stack of scenes. They are kept inside the
 * chapter's own HTML as <section data-segment="id" data-title="..."> blocks (the
 * attribute keeps its original name so chapters saved earlier still open), so
 * the chapter text stays the single stored copy: revisions, suggestions, the
 * preview and the epub all keep working on it unchanged.
 */
export interface Scene {
  id: Id;
  title: string;
  html: string;
}

export function newScene(html = "", title = ""): Scene {
  return { id: newId(), title, html };
}

/** Splits a chapter's HTML into scenes. Text written before scenes existed becomes one scene. */
export function parseScenes(html: string): Scene[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const scenes: Scene[] = [];
  let loose = "";

  const flushLoose = () => {
    if (loose.trim()) scenes.push(newScene(loose));
    loose = "";
  };

  for (const node of Array.from(doc.body.childNodes)) {
    if (node instanceof Element && node.tagName === "SECTION" && node.hasAttribute("data-segment")) {
      flushLoose();
      scenes.push({
        id: node.getAttribute("data-segment") || newId(),
        title: node.getAttribute("data-title") ?? "",
        html: node.innerHTML,
      });
    } else if (node instanceof Element) {
      loose += node.outerHTML;
    } else if (node.nodeType === Node.TEXT_NODE) {
      loose += escapeHtml(node.textContent ?? "");
    }
  }
  flushLoose();

  return scenes.length > 0 ? scenes : [newScene()];
}

/** Joins scenes back into the chapter's HTML. */
export function serializeScenes(scenes: Scene[]): string {
  return scenes
    .map((s) => `<section data-segment="${escapeHtml(s.id)}" data-title="${escapeHtml(s.title)}">${s.html}</section>`)
    .join("");
}

// Scenes are replaced, never changed in place, so a count stays valid for the life of the object.
const wordCache = new WeakMap<Scene, number>();

export function sceneWords(scene: Scene): number {
  let words = wordCache.get(scene);
  if (words === undefined) {
    words = countWords(scene.html);
    wordCache.set(scene, words);
  }
  return words;
}

/** Moves a scene next to another one. Returns the same array when nothing would change. */
export function moveSceneNextTo(scenes: Scene[], movingId: Id, targetId: Id, after: boolean): Scene[] {
  if (movingId === targetId) return scenes;
  const moving = scenes.find((s) => s.id === movingId);
  if (!moving) return scenes;
  const rest = scenes.filter((s) => s.id !== movingId);
  const at = rest.findIndex((s) => s.id === targetId);
  if (at === -1) return scenes;
  rest.splice(after ? at + 1 : at, 0, moving);
  return rest.every((s, i) => s === scenes[i]) ? scenes : rest;
}
