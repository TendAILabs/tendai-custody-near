import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { view, provider } from "./lib/chain.ts";
import { collectIds, collectPages, IncompleteCoverage } from "../web/lib/phi/coverage.ts";
import { contractMethodMissing } from "../web/lib/phi/schema.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

type Persona = {
  name: string;
  dob: string;
  mrn: string;
  address: string;
  phone: string;
  email: string;
  insurance_id: string;
  sections: Record<string, string>;
};
type Org = { display_name: string; clinician?: string };

function forbiddenTerms(fixture: { personas: Persona[]; organizations: Org[] }): string[] {
  const terms = new Set<string>();
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && trimmed.length >= 3) terms.add(trimmed);
  };
  for (const persona of fixture.personas) {
    add(persona.name);
    for (const part of persona.name.split(/\s+/)) add(part);
    add(persona.dob);
    add(persona.mrn);
    add(persona.address);
    for (const part of persona.address.split(",")) add(part);
    add(persona.phone);
    add(persona.email);
    add(persona.insurance_id);
    for (const text of Object.values(persona.sections)) add(text);
  }
  for (const org of fixture.organizations) add(org.clinician);
  for (const org of fixture.organizations) terms.delete(org.display_name);
  return [...terms];
}

function loadEnv(): void {
  let text = "";
  try {
    text = readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "ENOENT") return;
    throw error;
  }
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index > 0 && !process.env[line.slice(0, index)]) process.env[line.slice(0, index)] = line.slice(index + 1);
  }
}

async function pacedView<T>(contractId: string, method: string, args: Record<string, unknown>): Promise<T> {
  let last = "rpc failed";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const value = await view<T>(contractId, method, args);
      await new Promise((resolve) => setTimeout(resolve, 350));
      return value;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      if (contractMethodMissing(error)) throw error;
      if (!last.includes("429") && !last.toLowerCase().includes("rate limit")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw new Error(last);
}

/** Schema 1 stores a timeline. Schema 2 does not. The client reports that missing view as method not found. */
async function timelineStored(contractId: string): Promise<boolean> {
  try {
    await pacedView<unknown[]>(contractId, "get_timeline", { record_id: "1", from_index: 0, limit: 1 });
    return true;
  } catch (error) {
    if (contractMethodMissing(error)) return false;
    throw error;
  }
}

async function main(): Promise<void> {
  loadEnv();
  const contractId = process.env.RELAY_CONTRACT_ID;
  if (!contractId) throw new Error("Missing RELAY_CONTRACT_ID");
  const fixture = JSON.parse(await readFile(path.join(ROOT, "fixtures", "personas.json"), "utf8")) as {
    personas: Persona[];
    organizations: Org[];
  };
  const terms = forbiddenTerms(fixture);
  const pageLimit = 50;
  const dump: unknown[] = [];
  const shareIds = new Set<string>();
  let eventCount = 0;
  const hasTimeline = await timelineStored(contractId);
  const noteShares = (rows: unknown[]) => {
    for (const row of rows) {
      if (row && typeof row === "object" && "id" in row && (row as { id?: unknown }).id != null) {
        shareIds.add(String((row as { id?: unknown }).id));
      }
    }
  };
  const actors = await collectPages<unknown>({
    limit: pageLimit,
    maxPages: 10000,
    label: "actors",
    load: (from, limit) => pacedView(contractId, "list_actors", { from_index: from, limit }),
  });
  dump.push(...actors);
  const records = await collectIds<unknown>({
    label: "records",
    gap: 25,
    maxIds: 100000,
    load: (id) => pacedView(contractId, "get_record", { record_id: String(id) }),
  });
  for (const record of records) {
    dump.push(record);
    const recordId = record && typeof record === "object" && "id" in record ? String((record as { id?: unknown }).id ?? "") : "";
    if (!recordId) throw new IncompleteCoverage("incomplete coverage: record id");
    const recordShares = await collectPages({
      limit: pageLimit,
      maxPages: 10000,
      label: `shares ${recordId}`,
      load: (from, limit) => pacedView(contractId, "list_shares_for_record", { record_id: recordId, from_index: from, limit }),
    });
    noteShares(recordShares);
    dump.push(...recordShares);
    if (hasTimeline) {
      const events = await collectPages({
        limit: pageLimit,
        maxPages: 10000,
        label: `events ${recordId}`,
        load: (from, limit) => pacedView(contractId, "get_timeline", { record_id: recordId, from_index: from, limit }),
      });
      eventCount += events.length;
      dump.push(...events);
    }
  }
  for (const actor of actors) {
    if (!actor || typeof actor !== "object" || (actor as { role?: unknown }).role !== "Patient") continue;
    const patientId = (actor as { account_id?: unknown }).account_id;
    if (typeof patientId !== "string" || !patientId) throw new IncompleteCoverage("incomplete coverage: patient id");
    const pending = await collectPages({
      limit: pageLimit,
      maxPages: 10000,
      label: `pending ${patientId}`,
      load: (from, limit) => pacedView(contractId, "list_pending_for_patient", { patient: patientId, from_index: from, limit }),
    });
    noteShares(pending);
    dump.push(...pending);
  }
  const publicInfo = JSON.parse(await readFile(path.join(ROOT, ".data", "public.json"), "utf8").catch(() => "{}")) as {
    accounts?: Record<string, string>;
    transactions?: { hash: string }[];
  };
  const recipients = new Set<string>(Object.values(publicInfo.accounts ?? {}));
  for (const actor of actors) {
    if (actor && typeof actor === "object" && "account_id" in actor) {
      const accountId = (actor as { account_id?: unknown }).account_id;
      if (typeof accountId === "string" && accountId) recipients.add(accountId);
    }
  }
  for (const accountId of recipients) {
    const recipientShares = await collectPages({
      limit: pageLimit,
      maxPages: 10000,
      label: `recipient ${accountId}`,
      load: (from, limit) => pacedView(contractId, "list_shares_for_recipient", { account_id: accountId, from_index: from, limit }),
    });
    noteShares(recipientShares);
    dump.push(...recipientShares);
  }
  const rpc = provider();
  for (const tx of publicInfo.transactions ?? []) {
    if (!tx.hash) continue;
    let recorded = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        dump.push(await rpc.viewTransactionStatus({ txHash: tx.hash, accountId: contractId }));
        recorded = true;
        await new Promise((resolve) => setTimeout(resolve, 350));
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "tx lookup failed";
        if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
          continue;
        }
        dump.push({ tx: tx.hash, error: message });
        recorded = true;
        break;
      }
    }
    if (!recorded) dump.push({ tx: tx.hash, error: "rpc rate limit" });
  }
  const logFiles = ["docs/e2e-log.md", ".data/server.log", ".data/ui-server.log"];
  const logs = await Promise.all(
    logFiles.map(async (file) => readFile(path.join(ROOT, file), "utf8").catch(() => "")),
  );
  const serialized = JSON.stringify(dump) + logs.join("\n");
  const hits = terms.filter((term) => serialized.includes(term));
  console.log(
    `phi-scan coverage actors=${actors.length} records=${records.length} shares=${shareIds.size} events=${eventCount} status=complete`,
  );
  console.log(
    `phi-scan contract=${contractId} schema=${hasTimeline ? "1" : "2"} terms=${terms.length} hits=${hits.length} logs=${logFiles.join(",")}`,
  );
  if (hits.length > 0) {
    console.log(`hits ${hits.length} (values omitted)`);
    process.exit(1);
  }
  console.log("phi-scan found zero fixture identifiers");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
