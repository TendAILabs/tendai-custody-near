import { eventExplorer, type ExplorerLink } from "./explorer.ts";
import type { ChainActor, ChainEvent, ChainShareFull } from "./custody.ts";

export const KIND_LABEL: Record<string, string> = {
  record_created: "Chart created",
  referral_requested: "Referral sent",
  share_consented: "Share approved",
  share_declined: "Share declined",
  share_transformed: "Summary attached",
  share_created: "Share created",
  share_opened: "Share opened",
  record_opened: "Record opened",
  reply_submitted: "Reply recorded",
  share_revoked: "Access revoked",
};

export type ActorDirectory = {
  role: string;
  name: string;
};

export type ActivityAccounts = {
  clinic?: string;
  patient?: string;
  hospital?: string;
  second?: string;
  app?: string;
};

export type TxBook = {
  referralTx: string | null;
  consentTx: string | null;
  hospitalOpenTx: string | null;
  consultTx: string | null;
  secondTx: string | null;
  secondReplyTx: string | null;
  deidTx: string | null;
  revokeTx: string | null;
  recordTx?: string | null;
  shareId: string | null;
  secondShareId: string | null;
  deidShareId: string | null;
};

export type ActivityRow = {
  id: string;
  atNs: string;
  time: string;
  date: string;
  zone: string;
  kind: string;
  kindLabel: string;
  actor: string;
  role: string;
  holderId: string;
  holderLabel: string;
  sentence: string;
  detail: string;
  color: string;
  tx: string | null;
  explorer: ExplorerLink;
  raw: Record<string, unknown>;
};

export function formatEventTime(atNs: string, timeZone?: string): { time: string; date: string; zone: string } {
  let ms: number;
  try {
    ms = Number(BigInt(atNs) / BigInt(1_000_000));
  } catch {
    return { time: "", date: atNs, zone: "" };
  }
  const when = new Date(ms);
  if (Number.isNaN(when.getTime())) return { time: "", date: atNs, zone: "" };
  const options = timeZone ? { timeZone } : {};
  const time = new Intl.DateTimeFormat("en-GB", { ...options, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(when);
  const date = new Intl.DateTimeFormat("en-GB", { ...options, day: "2-digit", month: "short", year: "numeric" }).format(when);
  const zone =
    new Intl.DateTimeFormat("en-GB", { ...options, hour: "2-digit", timeZoneName: "short" })
      .formatToParts(when)
      .find((part) => part.type === "timeZoneName")?.value ?? "";
  return { time, date, zone };
}

const KNOWN_ACTORS: Record<string, ActorDirectory> = {
  "st. aster general": { role: "Hospital", name: "St. Aster Hospital" },
  "st. aster hospital": { role: "Hospital", name: "St. Aster Hospital" },
  "riverbend family clinic": { role: "Clinic", name: "Riverbend Family Clinic" },
  "northgate heart institute": { role: "Second opinion", name: "Northgate Heart Institute" },
  "northgate imaging": { role: "Second opinion", name: "Northgate Heart Institute" },
  "reyes cardiology": { role: "Second opinion", name: "Northgate Heart Institute" },
  pulsefit: { role: "App", name: "PulseFit" },
  patient: { role: "Patient", name: "Maya Okafor" },
};

function canonicalActor(role: string, name: string): ActorDirectory {
  const known = KNOWN_ACTORS[name.trim().toLowerCase()];
  if (known) return known;
  if (role === "Patient") return { role: "Patient", name: name && name !== "Patient" ? name : "Maya Okafor" };
  if (role === "App") return { role: "App", name: name && name !== "App" ? name : "PulseFit" };
  if (role === "Hospital" || /hospital|general/i.test(name)) return { role: "Hospital", name: name || "St. Aster Hospital" };
  if (role === "Clinic") return { role: "Clinic", name: name && name !== "Clinic" ? name : "Riverbend Family Clinic" };
  return { role: role || "Account", name: name || role || "Account" };
}

export function describeActor(accountId: string, actors: ChainActor[], accounts: ActivityAccounts | null): ActorDirectory {
  const actor = actors.find((item) => item.account_id === accountId);
  if (actor) return canonicalActor(actor.role, actor.display_name);
  if (accounts?.patient && accountId === accounts.patient) return { role: "Patient", name: "Maya Okafor" };
  if (accounts?.app && accountId === accounts.app) return { role: "App", name: "PulseFit" };
  if (accounts?.hospital && accountId === accounts.hospital) return { role: "Hospital", name: "St. Aster Hospital" };
  if (accounts?.second && accountId === accounts.second) return { role: "Second opinion", name: "Northgate Heart Institute" };
  if (accounts?.clinic && accountId === accounts.clinic) return { role: "Clinic", name: "Riverbend Family Clinic" };
  return { role: "Account", name: accountId };
}

function who(actor: ActorDirectory): string {
  if (actor.name && actor.name !== actor.role) return actor.name;
  return actor.name || actor.role;
}

export function kindLabel(kind: string, share: ChainShareFull | undefined): string {
  if (kind === "share_created" && share?.kind === "SecondOpinion") return "Second opinion sent";
  if (kind === "share_created" && share?.kind === "DeidApp") return "Stripped copy sent";
  if (kind === "share_created" && share?.kind === "Transfer") return "Transfer sent";
  return KIND_LABEL[kind] ?? kind.replaceAll("_", " ");
}

function shareOf(event: ChainEvent, shares: ChainShareFull[]): ChainShareFull | undefined {
  if (!event.share_id) return undefined;
  return shares.find((share) => share.id === event.share_id);
}

function holderOf(event: ChainEvent, shares: ChainShareFull[]): ChainShareFull | undefined {
  const share = shareOf(event, shares);
  if (!share) return undefined;
  if (share.kind === "Reply" && share.parent) return shares.find((item) => item.id === share.parent) ?? share;
  return share;
}

export function sentenceFor(
  event: ChainEvent,
  shares: ChainShareFull[],
  actors: ChainActor[],
  accounts: ActivityAccounts | null,
): { sentence: string; detail: string; color: string } {
  const actor = who(describeActor(event.actor, actors, accounts));
  const share = shareOf(event, shares);
  const holderShare = holderOf(event, shares);
  const holder = holderShare ? who(describeActor(holderShare.to, actors, accounts)) : "the holder";
  if (event.kind === "record_created") {
    return {
      sentence: `${actor} created the chart.`,
      detail: "The chart text was not written to NEAR. This line is the id and the time.",
      color: "var(--h-clinic)",
    };
  }
  if (event.kind === "referral_requested") {
    return {
      sentence: `${actor} asked ${holder} to see the chart.`,
      detail: "NEAR stored ids, a purpose hash, and the time, and it did not store the chart.",
      color: "var(--h-clinic)",
    };
  }
  if (event.kind === "share_consented") {
    return {
      sentence: `${actor} approved the share to ${holder}.`,
      detail: "The approval is on NEAR. The chart text is not.",
      color: "var(--ink)",
    };
  }
  if (event.kind === "share_declined") {
    return {
      sentence: `${actor} declined the share.`,
      detail: "That holder cannot open it through TendAI Custody.",
      color: "var(--ink)",
    };
  }
  if (event.kind === "share_transformed") {
    return {
      sentence: "A sealed summary hash was attached to the share.",
      detail: "The summary text is not on NEAR.",
      color: "var(--ink)",
    };
  }
  if (event.kind === "share_created" && share?.kind === "DeidApp") {
    return {
      sentence: `${actor} sent a stripped copy to ${holder}.`,
      detail: "De-identification is best effort. A preview is not a promise that every identifier was removed.",
      color: "var(--h-app)",
    };
  }
  if (event.kind === "share_created" && share?.kind === "SecondOpinion") {
    return {
      sentence: `${actor} sent a second opinion to ${holder}.`,
      detail: "Read only. The first clinic cannot open this share.",
      color: "var(--h-2nd)",
    };
  }
  if (event.kind === "share_created" && share?.kind === "Transfer") {
    return {
      sentence: `${actor} sent the chart to ${holder}.`,
      detail: "NEAR stored ids and hashes for the transfer, and it did not store the chart.",
      color: "var(--h-clinic)",
    };
  }
  if (event.kind === "share_created") {
    return {
      sentence: `${actor} created a share for ${holder}.`,
      detail: "NEAR stored ids and hashes, and it did not store the chart.",
      color: "var(--ink)",
    };
  }
  if (event.kind === "share_opened") {
    const same = Boolean(holderShare && event.actor === holderShare.to);
    return {
      sentence: same ? `${actor} opened the share.` : `${actor} opened the share held by ${holder}.`,
      detail: "The open was written on NEAR before any chart text was shown.",
      color: share?.kind === "DeidApp" ? "var(--h-app)" : share?.kind === "SecondOpinion" ? "var(--h-2nd)" : "var(--h-hosp)",
    };
  }
  if (event.kind === "record_opened") {
    return {
      sentence: `${actor} opened the original record.`,
      detail: "The open was written on NEAR. The chart text was not.",
      color: "var(--ink)",
    };
  }
  if (event.kind === "reply_submitted") {
    return {
      sentence: `${actor} recorded a reply.`,
      detail: "The note goes back to the patient. NEAR stores a hash of the reply, not the note.",
      color: "var(--h-hosp)",
    };
  }
  if (event.kind === "share_revoked") {
    return {
      sentence: `${actor} revoked access for ${holder}.`,
      detail: "The next open through TendAI Custody is refused. A copy already downloaded is not erased.",
      color: "var(--red)",
    };
  }
  return {
    sentence: `${actor} recorded ${kindLabel(event.kind, share).toLowerCase()}.`,
    detail: "The account and the hashes are in the raw record. The chart text is not.",
    color: "var(--ink)",
  };
}

function candidateTx(event: ChainEvent, share: ChainShareFull | undefined, book: TxBook): string | null {
  if (event.kind === "record_created") return book.recordTx ?? null;
  if (event.kind === "referral_requested" && event.share_id && event.share_id === book.shareId) return book.referralTx;
  if (event.kind === "share_consented" && event.share_id && event.share_id === book.shareId) return book.consentTx;
  if (event.kind === "share_created" && event.share_id && event.share_id === book.secondShareId) return book.secondTx;
  if (event.kind === "share_created" && event.share_id && event.share_id === book.deidShareId) return book.deidTx;
  if (event.kind === "share_opened" && event.share_id && event.share_id === book.shareId) return book.hospitalOpenTx;
  if (event.kind === "reply_submitted") {
    const parent = share?.parent ?? null;
    if (parent && parent === book.shareId) return book.consultTx;
    if (parent && parent === book.secondShareId) return book.secondReplyTx;
  }
  if (event.kind === "share_revoked") {
    const known =
      (event.share_id && event.share_id === book.shareId) ||
      (event.share_id && event.share_id === book.secondShareId) ||
      (event.share_id && event.share_id === book.deidShareId);
    if (known) return book.revokeTx;
  }
  return null;
}

export function buildActivity(
  events: ChainEvent[],
  shares: ChainShareFull[],
  actors: ChainActor[],
  book: TxBook,
  contractId: string,
  options?: { timeZone?: string; formatTime?: boolean; accounts?: ActivityAccounts | null },
): ActivityRow[] {
  const formatTime = options?.formatTime !== false;
  const accounts = options?.accounts ?? null;
  let revokeIndex = -1;
  events.forEach((event, index) => {
    if (event.kind !== "share_revoked") return;
    const share = shareOf(event, shares);
    if (candidateTx(event, share, book)) revokeIndex = index;
  });
  const used = new Set<string>();
  return events.map((event, index) => {
    const share = shareOf(event, shares);
    const holderShare = holderOf(event, shares);
    const actor = describeActor(event.actor, actors, accounts);
    const holder = holderShare ? describeActor(holderShare.to, actors, accounts) : { role: "Record", name: "Chart record" };
    const words = sentenceFor(event, shares, actors, accounts);
    let tx = candidateTx(event, share, book);
    if (event.kind === "share_revoked" && index !== revokeIndex) tx = null;
    if (tx && used.has(tx)) tx = null;
    if (tx) used.add(tx);
    const explorer = eventExplorer({ tx, accountId: event.actor, contractId });
    const when = formatTime ? formatEventTime(event.at_ns, options?.timeZone) : { time: "", date: "", zone: "" };
    return {
      id: `${event.kind}-${event.at_ns}-${index}`,
      atNs: event.at_ns,
      time: when.time,
      date: when.date,
      zone: when.zone,
      kind: event.kind,
      kindLabel: kindLabel(event.kind, share),
      actor: event.actor,
      role: `${actor.role} · ${actor.name}`,
      holderId: holderShare ? holderShare.to : "",
      holderLabel: holder.name,
      sentence: words.sentence,
      detail: words.detail,
      color: words.color,
      tx: explorer.kind === "tx" ? tx : null,
      explorer,
      raw: {
        at_ns: event.at_ns,
        actor: event.actor,
        role: actor.role,
        kind: event.kind,
        share_id: event.share_id,
        detail_hash: event.detail_hash,
        tx: explorer.kind === "tx" ? tx : null,
      },
    };
  });
}

export function holderChoices(rows: ActivityRow[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!row.holderId || seen.has(row.holderId)) continue;
    seen.set(row.holderId, row.holderLabel);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

export function kindChoices(rows: ActivityRow[]): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (!seen.has(row.kind)) seen.set(row.kind, row.kindLabel);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

export function filterRows(rows: ActivityRow[], holderId: string, kind: string): ActivityRow[] {
  return rows.filter((row) => (holderId === "all" || row.holderId === holderId) && (kind === "all" || row.kind === kind));
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function activityCsv(rows: ActivityRow[]): string {
  const header = ["time", "date", "time_zone", "kind", "actor_role", "actor", "holder", "sentence", "detail", "transaction", "explorer"];
  const lines = rows.map((row) =>
    [row.time, row.date, row.zone, row.kind, row.role, row.actor, row.holderLabel, row.sentence, row.detail, row.tx ?? "", row.explorer.href]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

export function activityJson(rows: ActivityRow[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      time: row.time,
      date: row.date,
      time_zone: row.zone,
      kind: row.kind,
      actor_role: row.role,
      actor: row.actor,
      holder: row.holderLabel,
      sentence: row.sentence,
      detail: row.detail,
      transaction: row.tx,
      explorer: row.explorer.href,
      raw: row.raw,
    })),
    null,
    2,
  );
}

export function shareKindLabel(kind: string): string {
  if (kind === "Referral") return "Referral";
  if (kind === "SecondOpinion") return "Second opinion";
  if (kind === "Transfer") return "Transfer";
  if (kind === "DeidApp") return "Stripped app copy";
  if (kind === "Reply") return "Reply to the patient";
  return kind;
}

export function statusLabel(status: string): string {
  if (status === "Active") return "Can still open";
  if (status === "Requested") return "Waiting for approval";
  if (status === "Revoked") return "Revoked";
  if (status === "Declined") return "Declined";
  if (status === "Expired") return "Expired";
  return status;
}

export function stillHasAccess(shares: ChainShareFull[]): ChainShareFull[] {
  return shares.filter((share) => share.effective_status === "Active" && share.kind !== "Reply");
}
