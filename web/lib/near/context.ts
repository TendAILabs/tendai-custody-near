import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

/** Domain string shared with the Rust contract. Null bytes are part of the preimage. */
export const CONTEXT_DOMAIN = "referral_relay/v2/context\0near:testnet\0";

export const CREATE_METHODS = ["CreateRecord", "RequestReferral", "CreateShare", "SubmitReply"] as const;

export type CreateMethodName = (typeof CREATE_METHODS)[number];

const METHOD_TAG: Record<CreateMethodName, number> = {
  CreateRecord: 0,
  RequestReferral: 1,
  CreateShare: 2,
  SubmitReply: 3,
};

function borshString(value: string): Uint8Array {
  const bytes = utf8ToBytes(value);
  const out = new Uint8Array(4 + bytes.length);
  new DataView(out.buffer).setUint32(0, bytes.length, true);
  out.set(bytes, 4);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

/**
 * SHA-256 of the V2 domain plus Borsh(contract id, caller, method tag, request id).
 * The numeric record or share id is not an input.
 */
export function encryptionContext(input: {
  contractId: string;
  caller: string;
  method: CreateMethodName;
  requestId: string;
}): string {
  if (!/^[0-9a-fA-F]{64}$/.test(input.requestId)) throw new Error("request id must be 32 bytes hex");
  const domain = utf8ToBytes(CONTEXT_DOMAIN);
  const contract = borshString(input.contractId);
  const caller = borshString(input.caller);
  const request = hexToBytes(input.requestId.toLowerCase());
  const preimage = new Uint8Array(domain.length + contract.length + caller.length + 1 + request.length);
  let offset = 0;
  preimage.set(domain, offset);
  offset += domain.length;
  preimage.set(contract, offset);
  offset += contract.length;
  preimage.set(caller, offset);
  offset += caller.length;
  preimage[offset] = METHOD_TAG[input.method];
  offset += 1;
  preimage.set(request, offset);
  return bytesToHex(sha256(preimage));
}

export function custodyAad(input: {
  contractId: string;
  creator: string;
  contextHex: string;
  artifactType: "record-section" | "referral-purpose" | "share-artifact" | "reply-artifact";
  section?: string;
}): string {
  return `referral_relay/v2|near:testnet|${input.contractId}|${input.creator}|${input.contextHex}|${input.artifactType}|${input.section ?? ""}`;
}

export function randomRequestId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
