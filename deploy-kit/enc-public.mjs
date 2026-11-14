import { createPrivateKey, createPublicKey, hkdfSync } from "node:crypto";
import { readFileSync } from "node:fs";

const INFO = Buffer.from("referral-relay/v1/actor");
const PKCS8_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");

export function actorPublicHex(seedHex, accountId) {
  if (!/^[0-9a-f]{64}$/i.test(seedHex)) throw new Error("DEMO_ENC_SEED must be 32 bytes hex");
  const secret = Buffer.from(hkdfSync("sha256", Buffer.from(seedHex, "hex"), Buffer.from(accountId), INFO, 32));
  const pkcs8 = Buffer.concat([PKCS8_PREFIX, secret]);
  const privateKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return Buffer.from(spki).subarray(spki.length - 32).toString("hex");
}

function seedFromFile(path) {
  const text = readFileSync(path, "utf8");
  const line = text.split("\n").find((row) => row.startsWith("DEMO_ENC_SEED="));
  if (!line) throw new Error("DEMO_ENC_SEED is missing");
  return line.slice("DEMO_ENC_SEED=".length);
}

const entry = process.argv[1] && process.argv[1].endsWith("enc-public.mjs");
if (entry) {
  const account = process.argv[3];
  if (!process.argv[2] || !account) {
    console.error("Usage: node enc-public.mjs <vercel.env> <account-id>");
    process.exit(2);
  }
  process.stdout.write(actorPublicHex(seedFromFile(process.argv[2]), account));
}
