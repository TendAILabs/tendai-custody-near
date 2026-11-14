import { readFileSync } from "node:fs";
import path from "node:path";
import { runAttackChecks } from "../web/lib/dev/attack-checks.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

function loadEnv(): void {
  const text = readFileSync(path.join(ROOT, ".env"), "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    process.env[line.slice(0, index)] = line.slice(index + 1);
  }
}

const SIGNER_KEYS = ["CLINIC_A_FC_PRIVATE_KEY", "HOSPITAL_B_FC_PRIVATE_KEY", "DEMO_PATIENT_PRIVATE_KEY"];

async function main(): Promise<void> {
  try {
    loadEnv();
  } catch {
    console.log("attack-demo skipped, no signer keys in agent env");
    return;
  }
  if (SIGNER_KEYS.some((name) => !process.env[name])) {
    console.log("attack-demo skipped, no signer keys in agent env");
    return;
  }
  const report = await runAttackChecks();
  const contractId = process.env.RELAY_CONTRACT_ID ?? "";
  console.log(`contract ${contractId}`);
  console.log(`attack share ${report.shareId ?? "none"} next free ${report.nextFree ?? "none"}`);
  console.log("");
  console.log("| Attack | Result | Detail |");
  console.log("| --- | --- | --- |");
  for (const check of report.checks) {
    const detail = (check.detail ?? "").replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{20,}/g, "ed25519:[REDACTED]");
    const tx = check.tx ?? "";
    const cell = [detail, tx].filter(Boolean).join(" ");
    console.log(`| ${check.name} | ${check.pass ? "pass" : "fail"} | ${cell} |`);
  }
  if (report.checks.some((check) => !check.pass)) process.exit(1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]{20,}/g, "ed25519:[REDACTED]"));
  process.exit(1);
});
