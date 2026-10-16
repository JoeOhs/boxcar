import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getSetting,
  newId,
  setSetting,
  type AiSettings,
  type ApiKeyKind,
  type Id,
  type ImageAiSettings,
  type StoredApiKey,
} from "@/db/schema";
import { providerNeedsKey } from "./providers";

/**
 * The author's API keys, stored encrypted.
 *
 * Every key is encrypted with AES-GCM (Web Crypto) before it is written to the
 * local database. The encryption key is generated on this computer as a
 * non-extractable CryptoKey, so even the app's own code cannot export it; it is
 * kept in the settings table next to the ciphertext. That keeps the plain key out
 * of the database file, backups and browser storage dumps. The decrypted key
 * exists only in memory, for the length of one request to the provider.
 */

const VAULT_KEY = "keyVaultKey";
const activeSetting = (kind: ApiKeyKind) => `activeKey:${kind}`;

function cryptoApi(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot encrypt keys, so the key was not saved.");
  return subtle;
}

let vaultKeyCreation: Promise<CryptoKey> | undefined;

/** The encryption key, created the first time a key is saved. */
async function vaultKeyForSaving(): Promise<CryptoKey> {
  const existing = await getSetting<CryptoKey>(VAULT_KEY);
  if (existing) return existing;
  // Two saves at once must not each create a key, or the first one's ciphertext would be lost.
  vaultKeyCreation ??= (async () => {
    const again = await getSetting<CryptoKey>(VAULT_KEY);
    if (again) return again;
    const created = await cryptoApi().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await setSetting(VAULT_KEY, created);
    return created;
  })().finally(() => {
    vaultKeyCreation = undefined;
  });
  return vaultKeyCreation;
}

async function encrypt(plain: string): Promise<{ iv: Uint8Array; data: Uint8Array }> {
  const key = await vaultKeyForSaving();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await cryptoApi().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return { iv, data: new Uint8Array(data) };
}

async function decrypt(secret: { iv: Uint8Array; data: Uint8Array }, key: CryptoKey): Promise<string> {
  const plain = await cryptoApi().decrypt({ name: "AES-GCM", iv: secret.iv }, key, secret.data);
  return new TextDecoder().decode(plain);
}

/** The key in use among these: the one the author picked, else the newest that has not been revoked. */
function resolveInUse(rows: StoredApiKey[], pickedId: Id | undefined): StoredApiKey | undefined {
  const usable = rows.filter((r) => r.status === "active" && (r.secret || !providerNeedsKey(r.provider)));
  return usable.find((r) => r.id === pickedId) ?? usable.sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** Reads the stored rows first and decrypts afterwards, so live queries keep tracking the tables they read. */
async function readInUse(kind: ApiKeyKind): Promise<{ row: StoredApiKey; apiKey: string } | undefined> {
  const [rows, pickedId, vaultKey] = await Promise.all([
    db.apiKeys.where("kind").equals(kind).toArray(),
    getSetting<Id>(activeSetting(kind)),
    getSetting<CryptoKey>(VAULT_KEY),
  ]);
  const row = resolveInUse(rows, pickedId);
  if (!row) return undefined;
  // A provider that runs on this computer (Ollama) has no key to decrypt.
  if (!row.secret && !providerNeedsKey(row.provider)) return { row, apiKey: "" };
  if (!row.secret || !vaultKey) return undefined;
  try {
    const apiKey = await decrypt(row.secret, vaultKey);
    return apiKey ? { row, apiKey } : undefined;
  } catch {
    return undefined;
  }
}

/** The AI staff's key, decrypted, or undefined when none is stored. */
export async function getAiSettings(): Promise<AiSettings | undefined> {
  const found = await readInUse("text");
  return found
    ? { provider: found.row.provider as AiSettings["provider"], model: found.row.model, apiKey: found.apiKey, baseUrl: found.row.baseUrl }
    : undefined;
}

/** The Book Cover workshop's key, decrypted, or undefined when none is stored. */
export async function getImageAiSettings(): Promise<ImageAiSettings | undefined> {
  const found = await readInUse("image");
  return found
    ? { provider: found.row.provider as ImageAiSettings["provider"], model: found.row.model, apiKey: found.apiKey }
    : undefined;
}

export interface NewApiKey {
  provider: string;
  model: string;
  /** Empty for providers that need no key. */
  apiKey: string;
  /** The server address, for providers that run on this computer. */
  baseUrl?: string;
}

/** Encrypts and stores a key, and makes it the one in use for its kind. */
export async function addApiKey(kind: ApiKeyKind, input: NewApiKey): Promise<StoredApiKey> {
  const plain = input.apiKey.trim();
  const needsKey = providerNeedsKey(input.provider);
  if (needsKey && !plain) throw new Error("Paste your API key first.");
  const row: StoredApiKey = {
    id: newId(),
    kind,
    provider: input.provider,
    model: input.model.trim(),
    baseUrl: input.baseUrl?.trim() || undefined,
    tail: plain.slice(-4),
    status: "active",
    secret: needsKey ? await encrypt(plain) : undefined,
    createdAt: Date.now(),
  };
  await db.apiKeys.add(row);
  await setSetting(activeSetting(kind), row.id);
  return row;
}

/** Makes a stored key the one the app uses for its kind. */
export async function selectApiKey(row: StoredApiKey): Promise<void> {
  if (row.status !== "active") return;
  await setSetting(activeSetting(row.kind), row.id);
}

export async function setApiKeyModel(id: Id, model: string): Promise<void> {
  const value = model.trim();
  if (value) await db.apiKeys.update(id, { model: value });
}

/**
 * Revokes a key: the encrypted secret is wiped from this computer, so the app can
 * no longer use it. The entry stays in the list marked "Revoked". (To make the
 * provider reject the key everywhere, revoke it in the provider's dashboard too.)
 */
export async function revokeApiKey(id: Id): Promise<void> {
  await db.apiKeys.where("id").equals(id).modify((row) => {
    row.status = "revoked";
    row.revokedAt = Date.now();
    delete row.secret;
  });
}

/** Deletes a key's entry, whatever its status. */
export async function deleteApiKey(id: Id): Promise<void> {
  const row = await db.apiKeys.get(id);
  if (!row) return;
  await db.apiKeys.delete(id);
  if ((await getSetting<Id>(activeSetting(row.kind))) === id) await db.settings.delete(activeSetting(row.kind));
}

export interface ApiKeyList {
  /** Newest first, revoked ones included. */
  keys: StoredApiKey[];
  /** The key the app is using for this kind, if any. */
  inUseId: Id | null;
}

/** The stored keys of one kind, for the list in Settings. Never contains a plain key. */
export function useApiKeys(kind: ApiKeyKind): ApiKeyList | undefined {
  return useLiveQuery(async () => {
    const [rows, pickedId] = await Promise.all([
      db.apiKeys.where("kind").equals(kind).toArray(),
      getSetting<Id>(activeSetting(kind)),
    ]);
    return { keys: [...rows].sort((a, b) => b.createdAt - a.createdAt), inUseId: resolveInUse(rows, pickedId)?.id ?? null };
  }, [kind]);
}

let migration: Promise<void> | undefined;

/**
 * Keys saved by earlier versions of the app sat in the settings table as plain
 * text. This encrypts each one into the key list and erases the plain copy.
 * It runs once at start-up and does nothing when there is nothing to move.
 */
export function migrateLegacyKeys(): Promise<void> {
  migration ??= (async () => {
    const legacy: [string, ApiKeyKind][] = [
      ["ai", "text"],
      ["imageAi", "image"],
    ];
    for (const [settingKey, kind] of legacy) {
      const old = await getSetting<{ provider?: string; apiKey?: string; model?: string }>(settingKey);
      if (old === undefined) continue;
      if (old.apiKey?.trim() && old.provider) {
        await addApiKey(kind, { provider: old.provider, model: old.model ?? "", apiKey: old.apiKey });
      }
      await db.settings.delete(settingKey);
    }
  })().catch(() => {
    // Leave the old entry alone so nothing is lost; the next start tries again.
    migration = undefined;
  });
  return migration;
}
