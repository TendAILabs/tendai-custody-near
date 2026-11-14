import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { actorKeyPair } from "../web/lib/crypto/actor-key.ts";
import {
  canonicalEnvelopeBytes,
  cipherHash,
  decryptEnvelope,
  encryptEnvelope,
  sectionAad,
} from "../web/lib/crypto/envelope.ts";
import { runDeidPipeline } from "../web/lib/deid/pipeline.ts";
import { call, signer, view } from "./lib/chain.ts";
import { liveDeidClient, requireNearAiKey, teeSummary } from "../web/lib/tee/live.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 3417;
const BASE = `http://127.0.0.1:${PORT}`;
const lines: string[] = [];

function log(line: string): void {
  const safe = line.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/g, "ed25519:[REDACTED]");
  lines.push(safe);
  console.log(safe);
}

function loadEnv(): void {
  let text = "";
  try {
    text = readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch {
    throw new Error("Missing .env. Run setup:testnet first.");
  }
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    process.env[line.slice(0, index)] = line.slice(index + 1);
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function must(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function nextId(method: "get_record" | "get_share", arg: "record_id" | "share_id", contractId: string): Promise<string> {
  for (let id = 1; id < 500; id += 1) {
    const found = await view<unknown>(contractId, method, { [arg]: String(id) });
    if (found == null) return String(id);
  }
  throw new Error(`no free ${arg}`);
}

async function putBlob(bytes: Uint8Array): Promise<string> {
  const response = await fetch(`${BASE}/api/blob`, { method: "PUT", body: Buffer.from(bytes) });
  if (response.status !== 201) throw new Error(`blob put ${response.status}`);
  const payload = (await response.json()) as { hash: string };
  return payload.hash;
}

async function openGate(body: Record<string, string>): Promise<{ status: number; envelopes: { hash: string; body_base64: string }[]; error?: string }> {
  const response = await fetch(`${BASE}/api/open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { envelopes?: { hash: string; body_base64: string }[]; error?: string };
  return { status: response.status, envelopes: payload.envelopes ?? [], error: payload.error };
}

async function waitForServer(child: ChildProcess): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 60_000) {
    if (child.exitCode != null) throw new Error("next dev exited");
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch {
      // server still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("next dev did not become ready");
}

async function main(): Promise<void> {
  loadEnv();
  const teeRequested = process.argv.includes("--tee");
  if (teeRequested) requireNearAiKey();
  const contractId = must("RELAY_CONTRACT_ID");
  const seed = must("DEMO_ENC_SEED");
  const clinicId = must("CLINIC_A_ACCOUNT_ID");
  const clinicKey = must("CLINIC_A_FC_PRIVATE_KEY");
  const hospitalId = must("HOSPITAL_B_ACCOUNT_ID");
  const hospitalKey = must("HOSPITAL_B_FC_PRIVATE_KEY");
  const secondId = must("SECOND_OPINION_ACCOUNT_ID");
  const pulseId = must("PULSEFIT_ACCOUNT_ID");
  const patientId = must("DEMO_PATIENT_ACCOUNT_ID");
  const patientKey = must("DEMO_PATIENT_PRIVATE_KEY");
  const personas = JSON.parse(await readFile(path.join(ROOT, "fixtures", "personas.json"), "utf8")) as {
    personas: {
      id: string;
      name: string;
      dob: string;
      mrn: string;
      address: string;
      phone: string;
      email: string;
      insurance_id: string;
      anchor_date: string;
      sections: Record<string, string>;
    }[];
  };
  const maya = personas.personas.find((persona) => persona.id === "maya-okafor");
  if (!maya) throw new Error("maya fixture missing");

  const child = spawn(process.execPath, [path.join(ROOT, "web/node_modules/next/dist/bin/next"), "dev", "--port", String(PORT)], {
    cwd: path.join(ROOT, "web"),
    env: {
      ...process.env,
      BLOB_DIR: process.env.BLOB_DIR ?? path.join(ROOT, ".data", "blobs"),
      RELAY_CONTRACT_ID: contractId,
      NEAR_RPC_URL: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLog: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    serverLog.push(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    serverLog.push(chunk);
  });
  try {
    await waitForServer(child);
    log(`server ${BASE}`);
    log(`tee requested=${teeRequested}`);
    const clinic = signer(clinicId, clinicKey);
    const hospital = signer(hospitalId, hospitalKey);
    const patient = signer(patientId, patientKey);
    const patientEnc = actorKeyPair(seed, patientId);
    const clinicEnc = actorKeyPair(seed, clinicId);
    const hospitalEnc = actorKeyPair(seed, hospitalId);
    const secondEnc = actorKeyPair(seed, secondId);
    const pulseEnc = actorKeyPair(seed, pulseId);

    const recordId = await nextId("get_record", "record_id", contractId);
    const sectionHashes: { key: string; cipher_hash: string }[] = [];
    for (const key of ["history", "meds", "labs", "imaging", "notes"]) {
      const envelope = encryptEnvelope({
        plaintext: new TextEncoder().encode(maya.sections[key] ?? ""),
        aad: sectionAad(recordId, key),
        recipients: [
          { account_id: patientId, publicKey: patientEnc.publicKey },
          { account_id: clinicId, publicKey: clinicEnc.publicKey },
        ],
      });
      const hash = await putBlob(canonicalEnvelopeBytes(envelope));
      sectionHashes.push({ key, cipher_hash: hash });
    }
    const created = await call(clinic, contractId, "create_record", { patient: patientId, sections: sectionHashes }, 0n);
    log(`create_record id=${created.value} tx=${created.hash}`);

    const purpose = encryptEnvelope({
      plaintext: new TextEncoder().encode("Cardiology referral: exertional chest tightness"),
      aad: `purpose|${recordId}|v1`,
      recipients: [{ account_id: patientId, publicKey: patientEnc.publicKey }],
    });
    const requested = ["history", "meds", "labs", "imaging"];
    const referral = await call(clinic, contractId, "request_referral", {
      record_id: recordId,
      to: hospitalId,
      requested_sections: requested,
      purpose_hash: cipherHash(purpose),
    }, 0n);
    const shareId = String(referral.value);
    log(`request_referral id=${shareId} tx=${referral.hash}`);

    const ownerNonce = randomBytes(32);
    const ownerHash = sha256Hex(ownerNonce);
    const ownerOpen = await call(patient, contractId, "request_owner_open", { record_id: recordId, nonce_hash: ownerHash }, 0n);
    log(`request_owner_open tx=${ownerOpen.hash}`);
    const ownerFetch = await openGate({
      record_id: recordId,
      account_id: patientId,
      nonce: ownerNonce.toString("hex"),
    });
    log(`owner fetch status=${ownerFetch.status} envelopes=${ownerFetch.envelopes.length}`);
    if (ownerFetch.status !== 200) throw new Error(`owner open failed ${ownerFetch.error}`);
    for (const section of sectionHashes) {
      const found = ownerFetch.envelopes.find((envelope) => envelope.hash === section.cipher_hash);
      if (!found) throw new Error(`missing envelope ${section.key}`);
      const opened = decryptEnvelope({
        envelope: JSON.parse(Buffer.from(found.body_base64, "base64").toString("utf8")),
        account_id: patientId,
        secretKey: patientEnc.secretKey,
        expectedAad: sectionAad(recordId, section.key),
      });
      const matches = new TextDecoder().decode(opened) === (maya.sections[section.key] ?? "");
      log(`owner decrypt ${section.key} match=${matches}`);
      if (!matches) throw new Error(`decrypt mismatch ${section.key}`);
    }

    const granted = ["history", "meds", "labs"];
    let summary = "Local summary, no TEE call. Scope is history, meds, and labs.";
    let usedTee = false;
    let receiptJson = '{"tee":false}';
    if (teeRequested) {
      const summarized = await teeSummary(granted.map((key) => maya.sections[key] ?? "").join("\n"), (event) => {
        log(`tee stage=${event.stage}${event.chars != null ? ` chars=${event.chars}` : ""}`);
      });
      summary = summarized.text;
      usedTee = true;
      receiptJson = summarized.log.receiptJson;
      log(`tee model=${summarized.log.model} signatureKind=${summarized.log.signatureKind} verified=provider_tee`);
      log(`tee signer=${summarized.log.signer}`);
      log(`tee gateway tcb=${summarized.log.gatewayTcb} signer=${summarized.log.gatewaySigner} tls=${summarized.log.gatewayTls}`);
      log(`tee models=${summarized.log.modelCount} tcb=${summarized.log.modelTcb} gpu=${summarized.log.modelGpu} signer=${summarized.log.modelSigner}`);
      log(`tee latencyMs=${summarized.log.latencyMs} promptTokens=${summarized.log.promptTokens} completionTokens=${summarized.log.completionTokens} summaryChars=${summarized.log.summaryChars}`);
    }
    log(`tee ${usedTee}`);
    const artifact = encryptEnvelope({
      plaintext: new TextEncoder().encode(JSON.stringify({ tee: usedTee, summary, sections: Object.fromEntries(granted.map((key) => [key, maya.sections[key]])) })),
      aad: `${shareId}|artifact|v1`,
      recipients: [
        { account_id: hospitalId, publicKey: hospitalEnc.publicKey },
        { account_id: patientId, publicKey: patientEnc.publicKey },
      ],
    });
    const artifactHash = await putBlob(canonicalEnvelopeBytes(artifact));
    const receiptHash = sha256Hex(new TextEncoder().encode(receiptJson));
    const expiry = (BigInt(Date.now()) * 1_000_000n + 30n * 24n * 60n * 60n * 1_000_000_000n).toString();
    const approved = await call(patient, contractId, "approve_share", {
      share_id: shareId,
      granted_sections: granted,
      expires_at_ns: expiry,
      read_only: true,
      artifact_hash: artifactHash,
      tee_receipt_hash: receiptHash,
    }, 1n);
    log(`approve_share tx=${approved.hash}`);

    const openNonce = randomBytes(32);
    const openedTx = await call(hospital, contractId, "request_open", {
      share_id: shareId,
      nonce_hash: sha256Hex(openNonce),
    }, 0n);
    log(`request_open tx=${openedTx.hash}`);
    const fetched = await openGate({ share_id: shareId, account_id: hospitalId, nonce: openNonce.toString("hex") });
    log(`hospital fetch status=${fetched.status}`);
    if (fetched.status !== 200) throw new Error(`fetch failed ${fetched.error}`);
    const hospitalPlain = decryptEnvelope({
      envelope: JSON.parse(Buffer.from(fetched.envelopes[0].body_base64, "base64").toString("utf8")),
      account_id: hospitalId,
      secretKey: hospitalEnc.secretKey,
      expectedAad: `${shareId}|artifact|v1`,
    });
    const hospitalJson = JSON.parse(new TextDecoder().decode(hospitalPlain)) as { tee: boolean; sections: Record<string, string> };
    log(`hospital decrypt tee=${hospitalJson.tee} sections=${Object.keys(hospitalJson.sections).join(",")}`);

    const opinionId = await nextId("get_share", "share_id", contractId);
    const opinionExpiry = (BigInt(Date.now()) * 1_000_000n + 7n * 24n * 60n * 60n * 1_000_000_000n).toString();
    const opinionEnvelope = encryptEnvelope({
      plaintext: new TextEncoder().encode(JSON.stringify({ sections: { history: maya.sections.history } })),
      aad: `${opinionId}|artifact|v1`,
      recipients: [
        { account_id: secondId, publicKey: secondEnc.publicKey },
        { account_id: patientId, publicKey: patientEnc.publicKey },
      ],
    });
    const opinionHash = await putBlob(canonicalEnvelopeBytes(opinionEnvelope));
    const opinion = await call(patient, contractId, "create_share", {
      record_id: recordId,
      to: secondId,
      kind: "SecondOpinion",
      sections: ["history"],
      expires_at_ns: opinionExpiry,
      read_only: true,
      purpose_hash: opinionHash,
      artifact_hash: opinionHash,
      tee_receipt_hash: null,
      parent: shareId,
    }, 1n);
    log(`create_share SecondOpinion id=${opinion.value} tx=${opinion.hash}`);

    const deidIdentifiers = [
      { category: "name", value: maya.name },
      { category: "dob", value: maya.dob },
      { category: "mrn", value: maya.mrn },
      { category: "address", value: maya.address },
      { category: "phone", value: maya.phone },
      { category: "email", value: maya.email },
      { category: "insurance", value: maya.insurance_id },
    ];
    const prepared = await runDeidPipeline({
      text: `${maya.name} ${maya.dob} ${maya.mrn} ${maya.address} ${maya.phone} ${maya.email} ${maya.insurance_id} ${maya.sections.history} ${maya.sections.labs}`,
      identifiers: deidIdentifiers,
      anchorDate: maya.anchor_date,
      client: process.env.NEARAI_API_KEY?.trim()
        ? liveDeidClient((event) => log(`deid stage=${event.stage}${event.chars != null ? ` chars=${event.chars}` : ""}`))
        : null,
    });
    if (!prepared.ok) throw new Error(`DeidApp share not created: ${prepared.reason}`);
    log(`deid localOnly=${prepared.localOnly} fixture_name_left=${prepared.text.includes(maya.name)}`);
    const deidId = await nextId("get_share", "share_id", contractId);
    const deidEnvelope = encryptEnvelope({
      plaintext: new TextEncoder().encode(prepared.text),
      aad: `${deidId}|artifact|v1`,
      recipients: [
        { account_id: pulseId, publicKey: pulseEnc.publicKey },
        { account_id: patientId, publicKey: patientEnc.publicKey },
      ],
    });
    const deidHash = await putBlob(canonicalEnvelopeBytes(deidEnvelope));
    const deid = await call(patient, contractId, "create_share", {
      record_id: recordId,
      to: pulseId,
      kind: "DeidApp",
      sections: [],
      expires_at_ns: opinionExpiry,
      read_only: true,
      purpose_hash: deidHash,
      artifact_hash: deidHash,
      tee_receipt_hash: deidHash,
      parent: null,
    }, 1n);
    log(`create_share DeidApp id=${deid.value} tx=${deid.hash}`);

    const pendingNonce = randomBytes(32);
    await call(hospital, contractId, "request_open", {
      share_id: shareId,
      nonce_hash: sha256Hex(pendingNonce),
    }, 0n);
    log("stored a ticket and left it unfetched");
    const revoked = await call(patient, contractId, "revoke_share", { share_id: shareId }, 1n);
    log(`revoke_share tx=${revoked.hash}`);
    const revokeSeen = Date.now();
    let shareStatus = "";
    while (Date.now() - revokeSeen < 30_000) {
      const share = await view<{ effective_status?: string } | null>(contractId, "get_share", { share_id: shareId });
      shareStatus = share?.effective_status ?? "";
      if (shareStatus === "Revoked") break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    log(`revoke visible status=${shareStatus} waitedMs=${Date.now() - revokeSeen}`);
    if (shareStatus !== "Revoked") throw new Error("revoke was not visible");
    const staleTicket = await openGate({
      share_id: shareId,
      account_id: hospitalId,
      nonce: pendingNonce.toString("hex"),
    });
    log(`old ticket within 120s status=${staleTicket.status} error=${staleTicket.error ?? ""}`);
    if (staleTicket.status !== 403) throw new Error("old ticket was not rejected");
    try {
      await call(hospital, contractId, "request_open", {
        share_id: shareId,
        nonce_hash: sha256Hex(randomBytes(32)),
      }, 0n);
      throw new Error("revoked open unexpectedly succeeded");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`revoked open error contains ERR_REVOKED=${message.includes("ERR_REVOKED")}`);
      if (!message.includes("ERR_REVOKED")) throw error;
    }
    const replay = await openGate({ share_id: shareId, account_id: hospitalId, nonce: openNonce.toString("hex") });
    log(`replayed nonce fetch status=${replay.status} error=${replay.error ?? ""}`);
    if (replay.status !== 403 || replay.error !== "replay") throw new Error("replay was not 403");
    const freshDenied = await openGate({
      share_id: shareId,
      account_id: hospitalId,
      nonce: randomBytes(32).toString("hex"),
    });
    log(`revoked fresh nonce fetch status=${freshDenied.status} error=${freshDenied.error ?? ""}`);
    if (freshDenied.status !== 403 || freshDenied.error !== "revoked") throw new Error("revoked fetch was not 403");

    const publicPath = path.join(ROOT, ".data", "public.json");
    const prior = JSON.parse(await readFile(publicPath, "utf8").catch(() => '{"transactions":[]}')) as { transactions?: { step: string; hash: string }[] };
    prior.transactions = [
      ...(prior.transactions ?? []),
      { step: "e2e-create", hash: created.hash },
      { step: "e2e-referral", hash: referral.hash },
      { step: "e2e-approve", hash: approved.hash },
      { step: "e2e-open", hash: openedTx.hash },
      { step: "e2e-second", hash: opinion.hash },
      { step: "e2e-deid", hash: deid.hash },
      { step: "e2e-revoke", hash: revoked.hash },
    ];
    await mkdir(path.dirname(publicPath), { recursive: true });
    await writeFile(publicPath, JSON.stringify(prior, null, 2));
    log("e2e ok");
  } finally {
    child.kill("SIGTERM");
    const stamp = new Date().toISOString();
    const teeNote = teeRequested
      ? "NEAR AI was called with e2ee. provider_tee is required for the summary."
      : "NEAR AI was not called.";
    await mkdir(path.join(ROOT, ".data"), { recursive: true });
    await writeFile(path.join(ROOT, ".data", "server.log"), Buffer.concat(serverLog));
    await writeFile(
      path.join(ROOT, "docs", "e2e-log.md"),
      `# E2E log\n\nTestnet run at ${stamp}. ${teeNote} Private keys are not in this log.\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{70,}/g, "ed25519:[REDACTED]"));
  process.exit(1);
});
