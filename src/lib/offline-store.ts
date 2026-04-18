type EncryptedPayload = {
  iv: string;
  data: string;
};

import type { PinAction } from "@/lib/pin";

type OfflinePinReverify = {
  pin: string;
  action: PinAction;
  targetItemId?: string;
};

type OfflineQueueMeta = {
  feature?: "vault" | "notes" | "system";
  label?: string;
  pinReverify?: OfflinePinReverify;
};

export type OfflineQueueItem = {
  id: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  createdAt: string;
  meta?: OfflineQueueMeta;
};

const DB_NAME = "pv_offline_v1";
const DB_VERSION = 1;
const KV_STORE = "kv";
const QUEUE_STORE = "queue";
const CRYPTO_KEY_ID = "crypto_key";
const CRYPTO_SALT_ID = "crypto_salt";
const SESSION_PASSPHRASE_KEY = "pv_offline_passphrase_v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = function () {
        resolve(req.result as T | undefined);
      };
      req.onerror = function () {
        reject(req.error);
      };
      tx.oncomplete = function () {
        db.close();
      };
    });
  });
}

function idbPut<T>(storeName: string, key: IDBValidKey, value: T): Promise<void> {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(value as unknown as IDBValidKey, key);
      req.onsuccess = function () {
        resolve();
      };
      req.onerror = function () {
        reject(req.error);
      };
      tx.oncomplete = function () {
        db.close();
      };
    });
  });
}

function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = function () {
        resolve();
      };
      req.onerror = function () {
        reject(req.error);
      };
      tx.oncomplete = function () {
        db.close();
      };
    });
  });
}

function idbClear(storeName: string): Promise<void> {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = function () {
        resolve();
      };
      req.onerror = function () {
        reject(req.error);
      };
      tx.oncomplete = function () {
        db.close();
      };
    });
  });
}

function idbGetAll<T>(storeName: string): Promise<T[]> {
  return openDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = function () {
        resolve(req.result as T[]);
      };
      req.onerror = function () {
        reject(req.error);
      };
      tx.oncomplete = function () {
        db.close();
      };
    });
  });
}

async function getOfflineCryptoKey(): Promise<CryptoKey> {
  const passphrase = getOfflinePassphrase();
  if (passphrase) {
    return derivePassphraseKey(passphrase);
  }

  const existing = await idbGet<JsonWebKey>(KV_STORE, CRYPTO_KEY_ID).catch(function () {
    return undefined;
  });
  if (existing) {
    return crypto.subtle.importKey("jwk", existing, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key);
  await idbPut(KV_STORE, CRYPTO_KEY_ID, jwk);
  return key;
}

function getOfflinePassphrase() {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(SESSION_PASSPHRASE_KEY);
  return value && value.trim().length > 0 ? value : null;
}

async function getOrCreateSalt(): Promise<Uint8Array> {
  const existing = await idbGet<string>(KV_STORE, CRYPTO_SALT_ID).catch(function () {
    return undefined;
  });
  if (existing) {
    return Uint8Array.from(atob(existing), function (c) {
      return c.charCodeAt(0);
    });
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const encoded = btoa(String.fromCharCode.apply(null, Array.from(salt)));
  await idbPut(KV_STORE, CRYPTO_SALT_ID, encoded);
  return salt;
}

async function derivePassphraseKey(passphrase: string): Promise<CryptoKey> {
  const salt = await getOrCreateSalt();
  const stableSalt = new Uint8Array(salt.length);
  stableSalt.set(salt);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encodeText(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: stableSalt,
      iterations: 210_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function encodeText(input: string) {
  return new TextEncoder().encode(input);
}

function decodeText(input: ArrayBuffer) {
  return new TextDecoder().decode(input);
}

async function encryptPayload<T>(payload: T): Promise<EncryptedPayload> {
  const key = await getOfflineCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodeText(JSON.stringify(payload)),
  );
  return {
    iv: btoa(String.fromCharCode.apply(null, Array.from(iv))),
    data: btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(data)))),
  };
}

async function decryptPayload<T>(payload: EncryptedPayload): Promise<T | null> {
  if (!payload?.iv || !payload?.data) return null;
  const key = await getOfflineCryptoKey();
  const iv = Uint8Array.from(atob(payload.iv), function (c) {
    return c.charCodeAt(0);
  });
  const data = Uint8Array.from(atob(payload.data), function (c) {
    return c.charCodeAt(0);
  });
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(decodeText(decrypted)) as T;
}

export async function setOfflineCache<T>(key: string, value: T) {
  const encrypted = await encryptPayload(value);
  await idbPut(KV_STORE, key, encrypted);
}

export async function getOfflineCache<T>(key: string): Promise<T | null> {
  const payload = await idbGet<EncryptedPayload>(KV_STORE, key).catch(function () {
    return undefined;
  });
  if (!payload) return null;
  return decryptPayload<T>(payload).catch(function () {
    return null;
  });
}

export async function enqueueOfflineRequest(item: Omit<OfflineQueueItem, "id" | "createdAt">) {
  const record: OfflineQueueItem = {
    ...item,
    id: "offline:" + Date.now() + ":" + Math.random().toString(16).slice(2),
    createdAt: new Date().toISOString(),
  };
  const encrypted = await encryptPayload(record);
  await idbPut(QUEUE_STORE, record.id, encrypted);
  return record.id;
}

export async function listOfflineQueue(): Promise<OfflineQueueItem[]> {
  const items = await idbGetAll<EncryptedPayload>(QUEUE_STORE).catch(function () {
    return [];
  });
  const decodedItems = await Promise.all(
    items.map(function (item) {
      return decryptPayload<OfflineQueueItem>(item).catch(function () {
        return null;
      });
    }),
  );
  const results = decodedItems.filter(function (item): item is OfflineQueueItem {
    return Boolean(item);
  });
  return results.sort(function (a, b) {
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function getOfflineQueueStats() {
  const records = await idbGetAll<EncryptedPayload>(QUEUE_STORE).catch(function () {
    return [];
  });
  const decodedItems = await Promise.all(
    records.map(function (record) {
      return decryptPayload<OfflineQueueItem>(record).catch(function () {
        return null;
      });
    }),
  );
  const unlocked = decodedItems.filter(Boolean).length;
  return {
    total: records.length,
    unlocked: unlocked,
    locked: Math.max(0, records.length - unlocked),
  };
}

export async function removeOfflineQueueItem(id: string) {
  await idbDelete(QUEUE_STORE, id);
}

export async function clearOfflineQueue() {
  await idbClear(QUEUE_STORE);
}

export function setOfflineEncryptionPassphrase(passphrase: string) {
  if (typeof window === "undefined") return;
  const next = passphrase.trim();
  if (!next) return;
  window.sessionStorage.setItem(SESSION_PASSPHRASE_KEY, next);
}
