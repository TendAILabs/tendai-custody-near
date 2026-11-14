import { publishCheck, runAttackChecks, signerPublicKeys, type AttackReport, type SignerPublic } from "./attack-checks.ts";
import { admitDevPost, selftestFailureMessage } from "./selftest.ts";
import type { HitStore } from "../guard/visitor.ts";

const SECRET_NAMES = ["CLINIC_A_FC_PRIVATE_KEY", "HOSPITAL_B_FC_PRIVATE_KEY", "SECOND_OPINION_FC_PRIVATE_KEY", "DEMO_PATIENT_PRIVATE_KEY", "RR_SELFTEST_TOKEN"] as const;

export type AttackDemoBody = {
  contract: string;
  signers: SignerPublic[];
  checks: { name: string; pass: boolean; tx?: string }[];
};

function responseBody(report: AttackReport, signers: SignerPublic[]): AttackDemoBody {
  return {
    contract: process.env.RELAY_CONTRACT_ID ?? "",
    signers,
    checks: report.checks.map(publishCheck),
  };
}

function containsSecret(serialized: string): boolean {
  return SECRET_NAMES.some((name) => {
    const value = process.env[name]?.trim();
    return Boolean(value && value.length >= 8 && serialized.includes(value));
  });
}

export async function handleAttackDemo(
  request: Request,
  deps?: {
    run?: () => Promise<AttackReport>;
    signers?: () => SignerPublic[];
    now?: number;
    store?: HitStore;
  },
): Promise<Response> {
  const gate = await admitDevPost(request, {
    now: deps?.now,
    store: deps?.store,
    slot: "attack-demo",
    limitError: "Too many attack demo calls. Try again later.",
  });
  if (!gate.ok) return gate.response;
  try {
    const signers = deps?.signers ? deps.signers() : signerPublicKeys();
    const report = deps?.run ? await deps.run() : await runAttackChecks();
    const body = responseBody(report, signers);
    const serialized = JSON.stringify(body);
    if (containsSecret(serialized) || serialized.includes("ed25519:[REDACTED]")) {
      return Response.json({ error: "attack demo failed" }, { status: 500, headers: { "cache-control": "no-store" } });
    }
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.log(`[attack-demo] ${selftestFailureMessage(error)}`);
    return Response.json({ error: "attack demo failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
