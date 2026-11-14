import { bytesToHex } from "@noble/hashes/utils.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { KeyPair } from "near-api-js";

export type LocalDeviceKey = {
  kind: "local";
  accountId: string;
  secret: string;
  encSecretHex: string;
  encPublicHex: string;
};

export type WalletDeviceKey = {
  kind: "wallet";
  accountId: string;
  encSecretHex: string;
  encPublicHex: string;
};

export type DeviceKey = LocalDeviceKey | WalletDeviceKey;

export function publicDevice(record: DeviceKey): { kind: DeviceKey["kind"]; accountId: string; encPublicHex: string } {
  return { kind: record.kind, accountId: record.accountId, encPublicHex: record.encPublicHex };
}

export function createLocalDeviceKey(): LocalDeviceKey {
  const pair = KeyPair.fromRandom("ed25519");
  const raw = pair.getPublicKey().data;
  const accountId = bytesToHex(raw);
  const encSecret = x25519.utils.randomSecretKey();
  const encPublic = x25519.getPublicKey(encSecret);
  return {
    kind: "local",
    accountId,
    secret: pair.toString(),
    encSecretHex: bytesToHex(encSecret),
    encPublicHex: bytesToHex(encPublic),
  };
}

export function createWalletEncKey(accountId: string): WalletDeviceKey {
  const encSecret = x25519.utils.randomSecretKey();
  const encPublic = x25519.getPublicKey(encSecret);
  return {
    kind: "wallet",
    accountId,
    encSecretHex: bytesToHex(encSecret),
    encPublicHex: bytesToHex(encPublic),
  };
}

export type KeyStore = {
  load(): Promise<DeviceKey | null>;
  save(record: DeviceKey): Promise<void>;
  clear(): Promise<void>;
};

export function memoryKeyStore(): KeyStore {
  let current: DeviceKey | null = null;
  return {
    async load() {
      return current;
    },
    async save(record) {
      current = record;
    },
    async clear() {
      current = null;
    },
  };
}

const DB_NAME = "tendai-demo-key";
const STORE = "keys";

export function browserKeyStore(): KeyStore {
  return {
    load: () => idb((store) => request(store.get("device"))),
    save: (record) => idb((store) => request(store.put(record, "device"))).then(() => undefined),
    clear: () => idb((store) => request(store.delete("device"))).then(() => undefined),
  };
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("key store failed"));
  });
}

function idb<T>(run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const opened = indexedDB.open(DB_NAME, 1);
    opened.onupgradeneeded = () => {
      const db = opened.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    opened.onerror = () => reject(opened.error ?? new Error("key store failed"));
    opened.onsuccess = () => {
      const db = opened.result;
      const tx = db.transaction(STORE, "readwrite");
      run(tx.objectStore(STORE)).then(resolve, reject);
      tx.oncomplete = () => db.close();
    };
  });
}
