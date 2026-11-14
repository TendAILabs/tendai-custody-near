// Offline helper for docs/runbooks/pulsefit-fc-key.md.
// The Next.js app does not import this file.
// It writes key files under .data/keys and never prints a private key.

import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { KeyPair, type KeyPairString } from "near-api-js";

const ROOT = path.resolve(import.meta.dirname, "..");
const KEY_DIR = path.join(ROOT, ".data", "keys");
const FC_PATH = path.join(KEY_DIR, "pulsefit-fc.json");
const FULL_PATH = path.join(KEY_DIR, "pulsefit-full.json");
const SECRET = /ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/g;

function redact(text: string): string {
  return text.replace(SECRET, "ed25519:[REDACTED]");
}

async function writeKeyFile(file: string, publicKey: string, privateKey: string): Promise<void> {
  await mkdir(KEY_DIR, { recursive: true });
  const body = `${JSON.stringify({ public_key: publicKey, private_key: privateKey })}\n`;
  try {
    await writeFile(file, body, { mode: 0o600, flag: "wx" });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "EEXIST") {
      throw new Error(`${path.basename(file)} already exists. Leave it in place, or move it aside yourself.`);
    }
    throw error;
  }
  await chmod(file, 0o600);
}

async function writeSigner(): Promise<void> {
  const secret = process.env.PULSEFIT_FULL_PRIVATE_KEY ?? "";
  if (!secret) {
    console.error("PULSEFIT_FULL_PRIVATE_KEY is not set");
    process.exit(1);
  }
  let key: KeyPair;
  try {
    key = KeyPair.fromString(secret as KeyPairString);
  } catch {
    console.error("PULSEFIT_FULL_PRIVATE_KEY is not a usable key");
    process.exit(1);
  }
  const publicKey = key.getPublicKey().toString();
  await writeKeyFile(FULL_PATH, publicKey, secret);
  console.log(publicKey);
  console.log("wrote .data/keys/pulsefit-full.json");
}

async function generateFc(): Promise<void> {
  const key = KeyPair.fromRandom("ed25519");
  const publicKey = key.getPublicKey().toString();
  await writeKeyFile(FC_PATH, publicKey, key.toString());
  console.log(publicKey);
  console.log("wrote .data/keys/pulsefit-fc.json");
}

const writeSignerMode = process.argv.includes("--write-signer");

(writeSignerMode ? writeSigner() : generateFc()).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redact(message));
  process.exit(1);
});
