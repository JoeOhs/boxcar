import type { Id, OutlineItem, OutlineKind } from "@/db/schema";

export interface OutlineRow {
  item: OutlineItem;
  depth: number;
}

/** The outline tree as a flat list in reading order, with depth for indentation. */
export function flattenOutline(items: OutlineItem[]): OutlineRow[] {
  const ids = new Set(items.map((item) => item.id));
  const children = new Map<Id | null, OutlineItem[]>();
  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    const list = children.get(key);
    if (list) list.push(item);
    else children.set(key, [item]);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }
  const rows: OutlineRow[] = [];
  const visit = (parentId: Id | null, depth: number) => {
    for (const item of children.get(parentId) ?? []) {
      rows.push({ item, depth });
      visit(item.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export const OUTLINE_KIND_LABEL: Record<OutlineKind, string> = {
  act: "Act",
  chapter: "Chapter",
  scene: "Scene",
  beat: "Beat",
};

/** What a new child of this kind should be by default. */
export function childKind(parent: OutlineKind | null): OutlineKind {
  switch (parent) {
    case null:
      return "act";
    case "act":
      return "chapter";
    case "chapter":
      return "scene";
    default:
      return "beat";
  }
}

/** The outline as indented text, for giving to the AI outliner. */
export function outlineToText(items: OutlineItem[]): string {
  const rows = flattenOutline(items);
  if (rows.length === 0) return "(the outline is empty)";
  return rows
    .map(({ item, depth }) => {
      const summary = item.summary.trim() ? `: ${item.summary.trim()}` : "";
      return `${"  ".repeat(depth)}- [${item.kind}] ${item.title || "Untitled"}${summary}`;
    })
    .join("\n");
}
