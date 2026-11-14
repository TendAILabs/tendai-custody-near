import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const BLOB_MAX_BYTES = 1_000_000;
const memory = new Map<string, Uint8Array>();

// This process only, plus an optional directory for dev and tests.
// The de-id route sets its own maxDuration, so Vercel bundles it apart from
// /api/open. Bytes written there are not in the open route's memory or /tmp.
// Hosted opens check ciphertext the browser still holds against the on-chain hash.
// This module does not read a blob token and does not write plaintext.

export function blobDirectory(): string {
  return process.env.BLOB_DIR ?? path.join(process.cwd(), ".data", "blobs");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function defaultFile(hash: string): string {
  return path.join(process.cwd(), ".data", "blobs", hash);
}

function overrideFile(directory: string, hash: string): string {
  return path.join(/* turbopackIgnore: true */ directory, hash);
}

function fileFor(hash: string, directory?: string): string | null {
  if (!isSha256Hex(hash)) return null;
  return directory ? overrideFile(directory, hash) : defaultFile(hash);
}

export async function putBlob(bytes: Uint8Array, directory?: string): Promise<string> {
  if (bytes.byteLength === 0) throw new Error("empty blob");
  if (bytes.byteLength > BLOB_MAX_BYTES) throw new Error("blob too large");
  const hash = sha256Hex(bytes);
  const root = directory ?? process.env.BLOB_DIR;
  if (root) {
    await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
    const file = overrideFile(root, hash);
    try {
      await writeFile(/* turbopackIgnore: true */ file, bytes, { flag: "wx" });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
    }
  } else {
    await mkdir(path.join(process.cwd(), ".data", "blobs"), { recursive: true });
    try {
      await writeFile(path.join(process.cwd(), ".data", "blobs", hash), bytes, { flag: "wx" });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
    }
  }
  memory.set(hash, bytes);
  return hash;
}

export async function getBlob(hash: string, directory?: string): Promise<Uint8Array | null> {
  const cached = memory.get(hash);
  if (cached) return cached;
  const root = directory ?? process.env.BLOB_DIR;
  const file = fileFor(hash, root);
  if (!file) return null;
  try {
    if (root) return await readFile(/* turbopackIgnore: true */ file);
    return await readFile(path.join(process.cwd(), ".data", "blobs", hash));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
