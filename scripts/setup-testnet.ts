import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { KeyPair } from "near-api-js";
import { actorPublicHex } from "../web/lib/crypto/actor-key.ts";
import { canonicalEnvelopeBytes, encryptEnvelope, sectionAad } from "../web/lib/crypto/envelope.ts";
import { putBlob } from "../web/lib/blob/store.ts";
import { availableNear, call, signer, view } from "./lib/chain.ts";
import { runNear } from "./lib/cli.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const KEY_DIR = path.join(ROOT, ".data", "keys");
const PUBLIC_PATH = path.join(ROOT, ".data", "public.json");
const WASM = path.join(ROOT, "contract", "target", "near", "referral_relay.wasm");
const STAFF_METHODS = "create_record,request_referral,request_open,request_owner_open,submit_reply";
const APP_METHODS = "request_open";

type ActorSpec = {
  envId: string;
  envFull: string;
  envFc: string | null;
  role: "Clinic" | "Patient" | "App";
  display: string;
  sub: string;
  clinicKey: boolean;
  fcMethods: string | null;
};

const ACTORS: ActorSpec[] = [
  { envId: "CLINIC_A_ACCOUNT_ID", envFull: "CLINIC_A_FULL_PRIVATE_KEY", envFc: "CLINIC_A_FC_PRIVATE_KEY", role: "Clinic", display: "Riverbend Family Clinic", sub: "clinic-a", clinicKey: true, fcMethods: STAFF_METHODS },
  { envId: "HOSPITAL_B_ACCOUNT_ID", envFull: "HOSPITAL_B_FULL_PRIVATE_KEY", envFc: "HOSPITAL_B_FC_PRIVATE_KEY", role: "Clinic", display: "St. Aster Hospital", sub: "hospital-b", clinicKey: true, fcMethods: STAFF_METHODS },
  { envId: "SECOND_OPINION_ACCOUNT_ID", envFull: "SECOND_OPINION_FULL_PRIVATE_KEY", envFc: "SECOND_OPINION_FC_PRIVATE_KEY", role: "Clinic", display: "Northgate Heart Institute", sub: "second", clinicKey: true, fcMethods: STAFF_METHODS },
  { envId: "LAKESIDE_ACCOUNT_ID", envFull: "LAKESIDE_FULL_PRIVATE_KEY", envFc: "LAKESIDE_FC_PRIVATE_KEY", role: "Clinic", display: "Lakeside Family Medicine", sub: "lakeside", clinicKey: true, fcMethods: STAFF_METHODS },
  { envId: "PULSEFIT_ACCOUNT_ID", envFull: "PULSEFIT_FULL_PRIVATE_KEY", envFc: "PULSEFIT_FC_PRIVATE_KEY", role: "App", display: "PulseFit", sub: "pulsefit", clinicKey: false, fcMethods: APP_METHODS },
  { envId: "DEMO_PATIENT_ACCOUNT_ID", envFull: "DEMO_PATIENT_PRIVATE_KEY", envFc: null, role: "Patient", display: "Patient", sub: "patient", clinicKey: false, fcMethods: null },
];

type KeyMaterial = { accountId: string; full: string; fullPublic: string; fc?: string; fcPublic?: string };

function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    out.set(line.slice(0, index), line.slice(index + 1));
  }
  return out;
}

function serializeEnv(values: Map<string, string>): string {
  return `${[...values.entries()].map(([key, value]) => `${key}=${value}`).join("\n")}\n`;
}

async function writeKeyFile(accountId: string, label: string, publicKey: string, privateKey: string): Promise<string> {
  await mkdir(KEY_DIR, { recursive: true });
  const file = path.join(KEY_DIR, `${label}.json`);
  await writeFile(file, JSON.stringify({ public_key: publicKey, private_key: privateKey }), { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}

function freshKey(): { secret: string; publicKey: string } {
  const key = KeyPair.fromRandom("ed25519");
  return { secret: key.toString(), publicKey: key.getPublicKey().toString() };
}

async function faucetAccount(accountId: string, publicKey: string): Promise<void> {
  await runNear([
    "account",
    "create-account",
    "sponsor-by-faucet-service",
    accountId,
    "use-manually-provided-public-key",
    publicKey,
    "network-config",
    "testnet",
    "create",
  ]);
}

async function fundChild(parentId: string, parentKeyFile: string, childId: string, publicKey: string, near: string): Promise<void> {
  await runNear([
    "account",
    "create-account",
    "fund-myself",
    childId,
    near,
    "use-manually-provided-public-key",
    publicKey,
    "sign-as",
    parentId,
    "network-config",
    "testnet",
    "sign-with-access-key-file",
    parentKeyFile,
    "send",
  ]);
}

async function main(): Promise<void> {
  const existing = await readFile(ENV_PATH, "utf8").catch(() => "");
  const env = parseEnv(existing);
  if (env.get("RELAY_CONTRACT_ID")) {
    console.log(`contract ${env.get("RELAY_CONTRACT_ID")}`);
    for (const actor of ACTORS) console.log(`${actor.sub} ${env.get(actor.envId) ?? ""}`);
    console.log("setup already recorded in .env");
    return;
  }

  const suffix = randomBytes(4).toString("hex");
  const contractId = `rr${suffix}.testnet`;
  const relay = freshKey();
  const relayKeyFile = await writeKeyFile(contractId, "relay", relay.publicKey, relay.secret);
  console.log(`creating contract account ${contractId}`);
  await faucetAccount(contractId, relay.publicKey);
  const funded = await availableNear(contractId);
  console.log(`faucet balance ${funded.toFixed(3)} NEAR`);

  console.log("deploying relay contract");
  await runNear([
    "contract",
    "deploy",
    contractId,
    "use-file",
    WASM,
    "with-init-call",
    "new",
    "json-args",
    JSON.stringify({ owner: contractId }),
    "prepaid-gas",
    "200 Tgas",
    "attached-deposit",
    "0 NEAR",
    "network-config",
    "testnet",
    "sign-with-access-key-file",
    relayKeyFile,
    "send",
  ]);
  const afterDeploy = await availableNear(contractId);
  console.log(`balance after deploy ${afterDeploy.toFixed(3)} NEAR`);

  const keys = new Map<string, KeyMaterial>();
  const useSubaccounts = afterDeploy >= 8;
  for (const actor of ACTORS) {
    const full = freshKey();
    const fc = actor.fcMethods ? freshKey() : undefined;
    const accountId = useSubaccounts ? `${actor.sub}.${contractId}` : `rr-${actor.sub}-${suffix}.testnet`;
    console.log(`creating ${actor.sub} ${accountId}`);
    if (useSubaccounts) {
      const amount = actor.clinicKey ? "1.5 NEAR" : actor.role === "Patient" ? "1 NEAR" : "0.5 NEAR";
      await fundChild(contractId, relayKeyFile, accountId, full.publicKey, amount);
    } else {
      await faucetAccount(accountId, full.publicKey);
    }
    keys.set(actor.sub, { accountId, full: full.secret, fullPublic: full.publicKey, fc: fc?.secret, fcPublic: fc?.publicKey });
  }

  for (const actor of ACTORS) {
    if (!actor.fcMethods) continue;
    const material = keys.get(actor.sub);
    if (!material?.fcPublic) continue;
    const fullFile = await writeKeyFile(material.accountId, `${actor.sub}-full`, material.fullPublic, material.full);
    console.log(`adding function-call key ${actor.sub}`);
    await runNear([
      "account",
      "add-key",
      material.accountId,
      "grant-function-call-access",
      "--allowance",
      "1 NEAR",
      "--contract-account-id",
      contractId,
      "--function-names",
      actor.fcMethods,
      "use-manually-provided-public-key",
      material.fcPublic,
      "network-config",
      "testnet",
      "sign-with-access-key-file",
      fullFile,
      "send",
    ]);
  }

  const seed = randomBytes(32).toString("hex");
  const owner = signer(contractId, relay.secret);
  for (const actor of ACTORS) {
    const material = keys.get(actor.sub);
    if (!material) continue;
    const tx = await call(owner, contractId, "register_actor", {
      account_id: material.accountId,
      role: actor.role,
      display_name: actor.display,
      enc_pubkey: actorPublicHex(seed, material.accountId),
    }, 0n);
    console.log(`registered ${actor.sub} tx ${tx.hash}`);
  }

  const clinic = keys.get("clinic-a");
  const patient = keys.get("patient");
  if (!clinic?.fc || !patient) throw new Error("missing clinic or patient key");
  const personas = JSON.parse(await readFile(path.join(ROOT, "fixtures", "personas.json"), "utf8")) as {
    personas: { id: string; sections: Record<string, string> }[];
  };
  const maya = personas.personas.find((persona) => persona.id === "maya-okafor");
  if (!maya) throw new Error("maya fixture missing");
  const recordId = "1";
  const sections = [];
  for (const key of ["history", "meds", "labs", "imaging", "notes"]) {
    const envelope = encryptEnvelope({
      plaintext: new TextEncoder().encode(maya.sections[key] ?? ""),
      aad: sectionAad(recordId, key),
      recipients: [
        { account_id: patient.accountId, publicKey: actorPublicKey(seed, patient.accountId) },
        { account_id: clinic.accountId, publicKey: actorPublicKey(seed, clinic.accountId) },
      ],
    });
    const bytes = canonicalEnvelopeBytes(envelope);
    const hash = await putBlob(bytes, path.join(ROOT, ".data", "blobs"));
    sections.push({ key, cipher_hash: hash });
  }
  const clinicSigner = signer(clinic.accountId, clinic.fc);
  const created = await call(clinicSigner, contractId, "create_record", {
    patient: patient.accountId,
    sections,
  }, 0n);
  console.log(`seeded record ${created.value} tx ${created.hash}`);

  env.set("NEAR_NETWORK", "testnet");
  env.set("NEAR_RPC_URL", "https://test.rpc.fastnear.com");
  env.set("RELAY_CONTRACT_ID", contractId);
  env.set("RELAY_OWNER_PRIVATE_KEY", relay.secret);
  env.set("DEMO_ENC_SEED", seed);
  env.set("DEMO_SESSION_SECRET", randomBytes(24).toString("hex"));
  env.set("BLOB_DIR", path.join(ROOT, ".data", "blobs"));
  for (const actor of ACTORS) {
    const material = keys.get(actor.sub);
    if (!material) continue;
    env.set(actor.envId, material.accountId);
    env.set(actor.envFull, material.full);
    if (actor.envFc && material.fc) env.set(actor.envFc, material.fc);
  }
  await writeFile(ENV_PATH, serializeEnv(env), { mode: 0o600 });
  await chmod(ENV_PATH, 0o600);

  const publicInfo = {
    network: "testnet",
    contractId,
    recordId: created.value,
    accounts: Object.fromEntries(ACTORS.map((actor) => [actor.sub, keys.get(actor.sub)?.accountId])),
    transactions: [{ step: "seed-record", hash: created.hash }],
  };
  await mkdir(path.dirname(PUBLIC_PATH), { recursive: true });
  await writeFile(PUBLIC_PATH, JSON.stringify(publicInfo, null, 2));
  const actors = await view<unknown[]>(contractId, "list_actors", { from_index: 0, limit: 20 });
  console.log(`list_actors ${actors.length}`);
  console.log(`explorer https://explorer.testnet.near.org/accounts/${contractId}`);
}

function actorPublicKey(seed: string, accountId: string): Uint8Array {
  const hex = actorPublicHex(seed, accountId);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/g, "ed25519:[REDACTED]"));
  process.exit(1);
});
