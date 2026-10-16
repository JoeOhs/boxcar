import { db } from "@/db/schema";

/**
 * Save a backup of everything to one file, and open it again.
 *
 * The file is JSON named for the app and the date. Pictures (covers) are written
 * as base64. API keys are deliberately left out: they are encrypted under a key
 * that never leaves this computer, and a key should not travel in a file. Keys
 * stay as they are when a backup is opened.
 */

export const BACKUP_APP = "boxcar-studio";
const BACKUP_VERSION = 1;

/** Tables that stay on this computer and are never written to, or replaced by, a backup. */
const LOCAL_ONLY_TABLES = new Set(["apiKeys"]);
/** Settings that belong to this computer's key vault. */
const LOCAL_ONLY_SETTINGS = (key: string) => key === "keyVaultKey" || key.startsWith("activeKey:");

interface EncodedBlob {
  __blob: string;
  data: string;
}

type Row = Record<string, unknown>;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  savedAt: number;
  tables: Record<string, Row[]>;
}

export interface BackupSummary {
  savedAt: number;
  workspaces: number;
  manuscripts: number;
  chapters: number;
  /** Everything else in the file (outline items, notes, research, ...). */
  otherRows: number;
}

function isEncodedBlob(value: unknown): value is EncodedBlob {
  return typeof value === "object" && value !== null && "__blob" in value && "data" in value;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("A picture could not be read for the backup."));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(data: string, type: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function encodeRow(row: Row): Promise<Row> {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Blob ? { __blob: value.type, data: await blobToBase64(value) } : value;
  }
  return out;
}

function decodeRow(row: Row): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = isEncodedBlob(value) ? base64ToBlob(value.data, value.__blob) : value;
  }
  return out;
}

/** Reads everything the app stores into one backup object. */
export async function collectBackup(): Promise<BackupFile> {
  const tables: Record<string, Row[]> = {};
  for (const table of db.tables) {
    if (LOCAL_ONLY_TABLES.has(table.name)) continue;
    let rows = (await table.toArray()) as Row[];
    if (table.name === "settings") rows = rows.filter((row) => !LOCAL_ONLY_SETTINGS(String(row.key)));
    tables[table.name] = await Promise.all(rows.map(encodeRow));
  }
  return { app: BACKUP_APP, version: BACKUP_VERSION, savedAt: Date.now(), tables };
}

/** The file name for a backup made today, e.g. boxcar-backup-2026-10-16.json. */
export function backupFileName(when = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `boxcar-backup-${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}.json`;
}

/** Everything the app stores, as one JSON file ready to download. */
export async function createBackup(): Promise<{ blob: Blob; filename: string }> {
  const backup = await collectBackup();
  return { blob: new Blob([JSON.stringify(backup)], { type: "application/json" }), filename: backupFileName() };
}

const NOT_A_BACKUP = "That file is not a boxcar backup, so nothing was changed.";

/** Reads a file and checks that it is a backup this app made. Throws a plain message when it is not. */
export async function readBackup(file: File): Promise<BackupFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const candidate = parsed as Partial<BackupFile> | null;
  if (!candidate || candidate.app !== BACKUP_APP || typeof candidate.tables !== "object" || candidate.tables === null) {
    throw new Error(NOT_A_BACKUP);
  }
  if (typeof candidate.version !== "number" || candidate.version > BACKUP_VERSION) {
    throw new Error("That backup was made by a newer version of boxcar. Update the app, then open it again.");
  }
  for (const rows of Object.values(candidate.tables)) {
    if (!Array.isArray(rows)) throw new Error(NOT_A_BACKUP);
  }
  return candidate as BackupFile;
}

/** What a backup holds, in counts, for the author to check before it replaces their data. */
export function summarizeBackup(backup: BackupFile): BackupSummary {
  const count = (name: string) => backup.tables[name]?.length ?? 0;
  const known = new Set(["workspaces", "manuscripts", "chapters"]);
  const otherRows = Object.entries(backup.tables)
    .filter(([name]) => !known.has(name) && !LOCAL_ONLY_TABLES.has(name))
    .reduce((sum, [, rows]) => sum + rows.length, 0);
  return {
    savedAt: backup.savedAt,
    workspaces: count("workspaces"),
    manuscripts: count("manuscripts"),
    chapters: count("chapters"),
    otherRows,
  };
}

/** What is stored here now, in the same counts. */
export async function summarizeCurrent(): Promise<Omit<BackupSummary, "savedAt">> {
  const [workspaces, manuscripts, chapters] = await Promise.all([db.workspaces.count(), db.manuscripts.count(), db.chapters.count()]);
  let otherRows = 0;
  for (const table of db.tables) {
    if (["workspaces", "manuscripts", "chapters"].includes(table.name) || LOCAL_ONLY_TABLES.has(table.name)) continue;
    if (table.name === "settings") continue;
    otherRows += await table.count();
  }
  return { workspaces, manuscripts, chapters, otherRows };
}

/** Replaces everything stored here with the backup, in one step: it all changes or nothing does. */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const tables = db.tables.filter((t) => !LOCAL_ONLY_TABLES.has(t.name));
  await db.transaction("rw", db.tables, async () => {
    for (const table of tables) {
      if (table.name === "settings") {
        const keep = (await table.toArray()).filter((row) => LOCAL_ONLY_SETTINGS(String(row.key)));
        await table.clear();
        await table.bulkAdd(keep);
      } else {
        await table.clear();
      }
    }
    for (const table of tables) {
      const rows = (backup.tables[table.name] ?? []).map(decodeRow);
      const usable = table.name === "settings" ? rows.filter((row) => !LOCAL_ONLY_SETTINGS(String(row.key))) : rows;
      if (usable.length > 0) await table.bulkPut(usable);
    }
  });
}
