import { createHash, randomBytes } from "node:crypto";
import { KeyPair, type KeyPairString } from "near-api-js";
import { generateX25519KeyPair } from "../crypto/envelope.ts";
import { cipherHash, encryptEnvelope, sectionAad } from "../crypto/envelope.ts";
import { callContract } from "../near/call.ts";
import { viewContract } from "../near/view.ts";
import { handleOpen, resetUsedNonces } from "../open/handle.ts";
import { flipCiphertextByte, recipientPublicKey, rejectSwappedArtifact } from "../relay/keys.ts";
import { redactEnv } from "../tee/completion.ts";

type ContractView = (method: string, args: Record<string, unknown>) => Promise<unknown>;


export type AttackCheck = {
  name: string;
  pass: boolean;
  tx?: string;
  detail?: string;
};

export type AttackReport = {
  checks: AttackCheck[];
  shareId?: string;
  nextFree?: string;
};

function must(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function redact(detail: string): string {
  return detail.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{20,}/g, "ed25519:[REDACTED]");
}

function txOf(hash: string | undefined): string | undefined {
  if (!hash || !/^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(hash)) return undefined;
  return hash;
}

function codeOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(/ERR_[A-Z0-9_]+/.exec(message)?.[0] ?? message.slice(0, 120));
}

function txFrom(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("txHash" in error)) return undefined;
  const hash = (error as { txHash?: unknown }).txHash;
  return typeof hash === "string" ? txOf(hash) : undefined;
}

export type ChainSigner = { accountId: string; secret: string };

const OPEN_READERS = [
  ["SECOND_OPINION_ACCOUNT_ID", "SECOND_OPINION_FC_PRIVATE_KEY"],
  ["HOSPITAL_B_ACCOUNT_ID", "HOSPITAL_B_FC_PRIVATE_KEY"],
] as const;

/** A signer that may call request_open and is not the share recipient.
 * Second opinion is first. Selftest and the attack demo both use this helper.
 * The hospital key is the fallback when it is not the recipient.
 */
export function unauthorizedReader(recipientId: string): ChainSigner | undefined {
  for (const [idName, keyName] of OPEN_READERS) {
    const accountId = process.env[idName]?.trim() ?? "";
    const secret = process.env[keyName]?.trim() ?? "";
    if (!accountId || !secret || accountId === recipientId) continue;
    return { accountId, secret };
  }
  return undefined;
}

async function send(
  call: typeof callContract,
  accountId: string,
  secret: string,
  methodName: string,
  args: Record<string, unknown>,
  deposit: bigint,
): Promise<{ hash: string; value: unknown }> {
  return call({ accountId, secret, methodName, args, deposit });
}

function failureDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : "attack checks failed";
  const cleaned = redactEnv(raw)
    .replace(/ed25519:\S+/g, "ed25519:[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 180 || /[{}`]/.test(cleaned)) return codeOf(new Error("attack checks failed"));
  return codeOf(new Error(cleaned));
}

function requestId(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export function publishCheck(check: AttackCheck): { name: string; pass: boolean; tx?: string } {
  return check.tx ? { name: check.name, pass: check.pass, tx: check.tx } : { name: check.name, pass: check.pass };
}

const SIGNERS = [
  ["clinic", "CLINIC_A_ACCOUNT_ID", "CLINIC_A_FC_PRIVATE_KEY"],
  ["hospital", "HOSPITAL_B_ACCOUNT_ID", "HOSPITAL_B_FC_PRIVATE_KEY"],
  ["patient", "DEMO_PATIENT_ACCOUNT_ID", "DEMO_PATIENT_PRIVATE_KEY"],
] as const;

export type SignerPublic = { role: string; accountId: string; publicKey: string };

export function signerPublicKeys(): SignerPublic[] {
  return SIGNERS.map(([role, accountName, secretName]) => {
    const accountId = process.env[accountName]?.trim() ?? "";
    const secret = process.env[secretName]?.trim() ?? "";
    if (!accountId || !secret) throw new Error("signer public key unavailable");
    let publicKey = "";
    try {
      publicKey = KeyPair.fromString(secret as KeyPairString).getPublicKey().toString();
    } catch {
      throw new Error("signer public key unavailable");
    }
    const body = publicKey.startsWith("ed25519:") ? publicKey.slice("ed25519:".length) : "";
    if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]+$/.test(publicKey) || !body || secret === publicKey || secret.includes(body)) {
      throw new Error("signer public key unavailable");
    }
    return { role, accountId, publicKey };
  });
}

// Same checks as `pnpm attack-demo`, plus the signed happy path those checks already perform.
// Signs with the clinic, hospital, and patient keys. When the second-opinion key is set,
// unauthorized open uses that key through unauthorizedReader.
export async function runAttackChecks(input?: {
  view?: ContractView;
  call?: typeof callContract;
}): Promise<AttackReport> {
  const checks: AttackCheck[] = [];
  const view: ContractView = input?.view ?? ((method, args) => viewContract(method, args));
  const call = input?.call ?? callContract;
  let shareId: string | undefined;
  let nextFree: string | undefined;
  try {
    must("RELAY_CONTRACT_ID");
    const clinicId = must("CLINIC_A_ACCOUNT_ID");
    const clinicKey = must("CLINIC_A_FC_PRIVATE_KEY");
    const hospitalId = must("HOSPITAL_B_ACCOUNT_ID");
    const hospitalKey = must("HOSPITAL_B_FC_PRIVATE_KEY");
    const patientId = must("DEMO_PATIENT_ACCOUNT_ID");
    const patientKey = must("DEMO_PATIENT_PRIVATE_KEY");
    const hash = createHash("sha256").update("fictional-attack").digest("hex");

    let created: { hash: string; value: unknown };
    try {
      created = await send(call, clinicId, clinicKey, "create_record", {
        request_id: requestId(),
        patient: patientId,
        sections: [{ key: "history", cipher_hash: hash }],
      }, BigInt(0));
    } catch (error) {
      checks.push({ name: "create_record", pass: false, detail: codeOf(error) });
      return { checks };
    }
    checks.push({ name: "create_record", pass: Boolean(created.hash), tx: txOf(created.hash), detail: `record ${String(created.value)}` });

    let referred: { hash: string; value: unknown };
    try {
      referred = await send(call, clinicId, clinicKey, "request_referral", {
        request_id: requestId(),
        record_id: String(created.value),
        expected_epoch: "1",
        to: hospitalId,
        requested_sections: ["history"],
        purpose_hash: hash,
      }, BigInt(0));
    } catch (error) {
      checks.push({ name: "share", pass: false, detail: codeOf(error) });
      return { checks, shareId: undefined };
    }
    shareId = String(referred.value);
    checks.push({ name: "share", pass: Boolean(referred.hash), tx: txOf(referred.hash), detail: `share ${shareId}` });

    // Clinic function-call keys cannot call request_open. unauthorizedReader picks a
    // signer that can, and that is not the recipient. Second opinion is preferred.
    let openShare = shareId;
    let reader = unauthorizedReader(hospitalId);
    if (!reader) {
      try {
        const decoy = await send(call, clinicId, clinicKey, "request_referral", {
          request_id: requestId(),
          record_id: String(created.value),
          expected_epoch: "1",
          to: clinicId,
          requested_sections: ["history"],
          purpose_hash: hash,
        }, BigInt(0));
        openShare = String(decoy.value);
        reader = unauthorizedReader(clinicId);
      } catch (error) {
        checks.push({ name: "unauthorized open", pass: false, tx: txFrom(error), detail: codeOf(error) });
      }
    }
    if (reader && openShare) {
      let code = "";
      let tx: string | undefined;
      try {
        await send(call, reader.accountId, reader.secret, "request_open", { share_id: openShare, nonce_hash: hash }, BigInt(0));
        code = "unauthorized open succeeded";
      } catch (error) {
        code = codeOf(error);
        tx = txFrom(error);
      }
      let detail = code;
      if (openShare !== shareId) {
        try {
          await send(call, patientId, patientKey, "decline_share", { share_id: openShare }, BigInt(1));
        } catch (error) {
          detail = `${code} decline ${codeOf(error)}`.trim();
        }
      }
      checks.push({ name: "unauthorized open", pass: code === "ERR_UNAUTHORIZED", tx, detail });
    } else if (!checks.some((check) => check.name === "unauthorized open")) {
      checks.push({ name: "unauthorized open", pass: false, detail: "no unauthorized reader" });
    }

    const expiry = (BigInt(Date.now()) * BigInt(1000000) + BigInt(7) * BigInt(24) * BigInt(60) * BigInt(60) * BigInt(1000000000)).toString();
    try {
      const approved = await send(call, patientId, patientKey, "approve_share", {
        share_id: shareId,
        granted_sections: ["history"],
        expires_at_ns: expiry,
        read_only: true,
        artifact_hash: hash,
        tee_receipt_hash: hash,
      }, BigInt(1));
      checks.push({ name: "approve", pass: Boolean(approved.hash), tx: txOf(approved.hash) });
    } catch (error) {
      checks.push({ name: "approve", pass: false, detail: codeOf(error) });
      return { checks, shareId };
    }

    const nonce = randomBytes(32);
    const nonceHash = createHash("sha256").update(nonce).digest("hex");
    let opened: { hash: string; value: unknown };
    try {
      opened = await send(call, hospitalId, hospitalKey, "request_open", { share_id: shareId, nonce_hash: nonceHash }, BigInt(0));
    } catch (error) {
      checks.push({ name: "ticket open", pass: false, detail: codeOf(error) });
      return { checks, shareId };
    }
    checks.push({ name: "ticket open", pass: Boolean(opened.hash), tx: txOf(opened.hash) });

    resetUsedNonces();
    const deps = {
      checkTicket: async () => true,
      effectiveStatus: async () => "Active",
      blobHashes: async () => [hash],
      readBlob: async () => new Uint8Array([1, 2, 3]),
    };
    const first = await handleOpen({ account_id: hospitalId, nonce: nonce.toString("hex"), share_id: shareId }, deps);
    const second = await handleOpen({ account_id: hospitalId, nonce: nonce.toString("hex"), share_id: shareId }, deps);
    const replayBody = (await second.json()) as { error?: string };
    checks.push({
      name: "nonce replay",
      pass: first.status === 200 && second.status === 403 && replayBody.error === "replay",
      detail: `first ${first.status} second ${second.status} ${replayBody.error ?? ""}`,
    });

    const actor = (await view("get_actor", { account_id: hospitalId })) as { enc_pubkey?: string };
    const chainKey = actor.enc_pubkey ?? "";
    const offered = "ab".repeat(32);
    const chosen = recipientPublicKey({ chainHex: chainKey, serverHex: offered });
    checks.push({
      name: "key substitution",
      pass: chosen.publicKeyHex === chainKey.toLowerCase() && Boolean(chosen.warning),
      detail: chosen.warning ?? "no warning",
    });

    const key = generateX25519KeyPair();
    const real = encryptEnvelope({
      plaintext: new TextEncoder().encode("fictional note"),
      aad: sectionAad(String(created.value), "history"),
      recipients: [{ account_id: hospitalId, publicKey: key.publicKey }],
    });
    const swapped = { ...real, ciphertext: flipCiphertextByte(real.ciphertext) };
    let swapOk = false;
    try {
      rejectSwappedArtifact(cipherHash(swapped), hash);
    } catch (error) {
      swapOk = error instanceof Error && error.message === "envelope swap";
    }
    checks.push({
      name: "envelope swap",
      pass: swapOk && cipherHash(real) !== cipherHash(swapped),
      detail: swapOk ? "flipped byte rejected" : "not rejected",
    });

    try {
      const reply = await send(call, hospitalId, hospitalKey, "submit_reply", {
        request_id: requestId(),
        share_id: shareId,
        expected_epoch: "1",
        reply_hash: hash,
      }, BigInt(0));
      checks.push({ name: "consult reply", pass: Boolean(reply.hash), tx: txOf(reply.hash), detail: `reply ${String(reply.value)}` });
    } catch (error) {
      checks.push({ name: "consult reply", pass: false, detail: codeOf(error) });
    }

    let revoked: { hash: string; value: unknown };
    try {
      revoked = await send(call, patientId, patientKey, "revoke_share", { share_id: shareId }, BigInt(1));
    } catch (error) {
      checks.push({ name: "revoke", pass: false, detail: codeOf(error) });
      return { checks, shareId };
    }
    checks.push({ name: "revoke", pass: Boolean(revoked.hash), tx: txOf(revoked.hash) });

    try {
      await send(call, hospitalId, hospitalKey, "request_open", {
        share_id: shareId,
        nonce_hash: createHash("sha256").update(randomBytes(32)).digest("hex"),
      }, BigInt(0));
      checks.push({ name: "revoked open", pass: false, detail: "open succeeded" });
    } catch (error) {
      const code = codeOf(error);
      checks.push({ name: "revoked open", pass: code === "ERR_REVOKED", tx: txFrom(error), detail: code });
    }

    return { checks, shareId, nextFree };
  } catch (error) {
    checks.push({ name: "attack checks", pass: false, detail: failureDetail(error) });
    return { checks, shareId, nextFree };
  }
}
