import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export const SUPPORT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const SUPPORT_TTL_SECONDS = SUPPORT_RETENTION_MS / 1000;
export const ADMIN_PAGE_SIZE = 100;
const NONCE_MS = 10 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;

export type TicketStatus = "open" | "answered" | "closed";

export type Ticket = {
  id: string;
  walletId: string;
  subject: string;
  message: string;
  createdAt: number;
  updatedAt: number;
  status: TicketStatus;
  reply: string;
  repliedAt: number | null;
  closedAt: number | null;
};

export type AdminPage = { tickets: Ticket[]; cursor: string | null };

export type TicketStore = {
  issueNonce(now: number): Promise<string>;
  takeNonce(id: string, now: number): Promise<boolean>;
  addTicket(input: { walletId: string; subject: string; message: string; now: number }): Promise<Ticket>;
  listWallet(walletId: string, now: number): Promise<Ticket[]>;
  listAdmin(now: number, cursor?: string): Promise<AdminPage>;
  replyTicket(id: string, reply: string, now: number): Promise<Ticket | null>;
  closeTicket(id: string, now: number): Promise<Ticket | null>;
};

export function adminPageBounds(cursor?: string): { start: number; stop: number } {
  const start = cursor && /^\d{1,6}$/.test(cursor) ? Number(cursor) : 0;
  return { start, stop: start + ADMIN_PAGE_SIZE - 1 };
}

export type LimitDecision = "allow" | "deny" | "error";

export type SupportLimits = {
  ip(id: string, now: number): Promise<LimitDecision>;
  wallet(id: string, now: number): Promise<LimitDecision>;
};

function asTicket(value: unknown): Ticket | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const status = row.status;
  if (status !== "open" && status !== "answered" && status !== "closed") return null;
  if (typeof row.id !== "string" || typeof row.walletId !== "string" || typeof row.subject !== "string" || typeof row.message !== "string") return null;
  if (typeof row.createdAt !== "number" || typeof row.updatedAt !== "number") return null;
  return {
    id: row.id,
    walletId: row.walletId,
    subject: row.subject,
    message: row.message,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status,
    reply: typeof row.reply === "string" ? row.reply : "",
    repliedAt: typeof row.repliedAt === "number" ? row.repliedAt : null,
    closedAt: typeof row.closedAt === "number" ? row.closedAt : null,
  };
}

export function memoryTicketStore(): TicketStore & { all(): Ticket[] } {
  const tickets = new Map<string, Ticket>();
  const wallets = new Map<string, Set<string>>();
  const nonces = new Map<string, number>();
  const live = (ticket: Ticket, now: number) => now - ticket.updatedAt < SUPPORT_RETENTION_MS;
  return {
    all: () => [...tickets.values()],
    async issueNonce(now) {
      const id = randomBytes(32).toString("hex");
      nonces.set(id, now + NONCE_MS);
      return id;
    },
    async takeNonce(id, now) {
      const exp = nonces.get(id);
      nonces.delete(id);
      return typeof exp === "number" && exp > now;
    },
    async addTicket(input) {
      const ticket: Ticket = {
        id: randomBytes(16).toString("hex"),
        walletId: input.walletId,
        subject: input.subject,
        message: input.message,
        createdAt: input.now,
        updatedAt: input.now,
        status: "open",
        reply: "",
        repliedAt: null,
        closedAt: null,
      };
      tickets.set(ticket.id, ticket);
      const set = wallets.get(input.walletId) ?? new Set<string>();
      set.add(ticket.id);
      wallets.set(input.walletId, set);
      return ticket;
    },
    async listWallet(walletId, now) {
      const ids = wallets.get(walletId) ?? new Set<string>();
      const rows: Ticket[] = [];
      for (const id of ids) {
        const ticket = tickets.get(id);
        if (!ticket || !live(ticket, now)) {
          ids.delete(id);
          tickets.delete(id);
          continue;
        }
        rows.push(ticket);
      }
      return rows.sort((left, right) => right.updatedAt - left.updatedAt);
    },
    async listAdmin(now, cursor) {
      const rows: Ticket[] = [];
      for (const [id, ticket] of tickets) {
        if (!live(ticket, now)) {
          tickets.delete(id);
          wallets.get(ticket.walletId)?.delete(id);
          continue;
        }
        rows.push(ticket);
      }
      rows.sort((left, right) => right.updatedAt - left.updatedAt);
      const { start } = adminPageBounds(cursor);
      const page = rows.slice(start, start + ADMIN_PAGE_SIZE);
      const next = page.length === ADMIN_PAGE_SIZE ? String(start + ADMIN_PAGE_SIZE) : null;
      return { tickets: page, cursor: next };
    },
    async replyTicket(id, reply, now) {
      const ticket = tickets.get(id);
      if (!ticket || !live(ticket, now) || ticket.status === "closed") return null;
      ticket.reply = reply;
      ticket.repliedAt = now;
      ticket.updatedAt = now;
      ticket.status = "answered";
      return ticket;
    },
    async closeTicket(id, now) {
      const ticket = tickets.get(id);
      if (!ticket || !live(ticket, now) || ticket.status === "closed") return null;
      ticket.status = "closed";
      ticket.closedAt = now;
      ticket.updatedAt = now;
      return ticket;
    },
  };
}

export function memoryLimits(ipLimit: number, walletLimit: number): SupportLimits {
  const buckets = new Map<string, number[]>();
  const take = async (key: string, now: number, limit: number) => {
    const stamps = (buckets.get(key) ?? []).filter((at) => now - at < WINDOW_MS && at <= now);
    if (stamps.length >= limit) return "deny";
    stamps.push(now);
    buckets.set(key, stamps);
    return "allow";
  };
  return {
    ip: (id, now) => take(`ip:${id}`, now, ipLimit),
    wallet: (id, now) => take(`wallet:${id}`, now, walletLimit),
  };
}

export function kvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export function devStoreAllowed(): boolean {
  return process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
}

export function supportKeyPrefix(): string {
  const env = process.env.VERCEL_ENV?.trim() || "dev";
  return `${env}:`;
}

function ticketKey(id: string): string {
  return `${supportKeyPrefix()}ticket:${id}`;
}

function walletKey(accountId: string): string {
  return `${supportKeyPrefix()}wallet:${accountId}:tickets`;
}

function adminKey(): string {
  return `${supportKeyPrefix()}admin:tickets`;
}

function nonceKey(id: string): string {
  return `${supportKeyPrefix()}nonce:${id}`;
}

export function redisTicketStore(redis: Redis): TicketStore {
  const save = (ticket: Ticket) => redis.set(ticketKey(ticket.id), ticket, { ex: SUPPORT_TTL_SECONDS });
  const load = async (ids: string[], now: number, drop: (id: string) => Promise<unknown>): Promise<Ticket[]> => {
    if (ids.length === 0) return [];
    const rows = await redis.mget<(Ticket | null)[]>(...ids.map(ticketKey));
    const tickets: Ticket[] = [];
    for (let index = 0; index < ids.length; index += 1) {
      const id = ids[index] ?? "";
      const ticket = asTicket(rows[index]);
      if (!ticket || now - ticket.updatedAt >= SUPPORT_RETENTION_MS) {
        await drop(id);
        continue;
      }
      tickets.push(ticket);
    }
    return tickets.sort((left, right) => right.updatedAt - left.updatedAt);
  };
  return {
    async issueNonce() {
      const id = randomBytes(32).toString("hex");
      await redis.set(nonceKey(id), "1", { ex: NONCE_MS / 1000 });
      return id;
    },
    async takeNonce(id) {
      const value = await redis.getdel(nonceKey(id));
      return value != null;
    },
    async addTicket(input) {
      const ticket: Ticket = {
        id: randomBytes(16).toString("hex"),
        walletId: input.walletId,
        subject: input.subject,
        message: input.message,
        createdAt: input.now,
        updatedAt: input.now,
        status: "open",
        reply: "",
        repliedAt: null,
        closedAt: null,
      };
      const batch = redis.pipeline();
      batch.set(ticketKey(ticket.id), ticket, { ex: SUPPORT_TTL_SECONDS });
      batch.sadd(walletKey(input.walletId), ticket.id);
      batch.expire(walletKey(input.walletId), SUPPORT_TTL_SECONDS);
      batch.zadd(adminKey(), { score: input.now, member: ticket.id });
      batch.expire(adminKey(), SUPPORT_TTL_SECONDS);
      await batch.exec();
      return ticket;
    },
    async listWallet(walletId, now) {
      const ids = await redis.smembers(walletKey(walletId));
      return load(ids, now, (id) => redis.srem(walletKey(walletId), id));
    },
    async listAdmin(now, cursor) {
      const { start, stop } = adminPageBounds(cursor);
      const ids = await redis.zrange<string[]>(adminKey(), start, stop, { rev: true });
      const rows = ids ?? [];
      const tickets = await load(rows, now, (id) => redis.zrem(adminKey(), id));
      const next = rows.length === ADMIN_PAGE_SIZE ? String(start + ADMIN_PAGE_SIZE) : null;
      return { tickets, cursor: next };
    },
    async replyTicket(id, reply, now) {
      return mutateTicket(redis, id, "reply", reply, now);
    },
    async closeTicket(id, now) {
      return mutateTicket(redis, id, "close", "", now);
    },
  };
}

const TICKET_MUTATION = `
local raw = redis.call("GET", KEYS[1])
if not raw then return false end
local ticket = cjson.decode(raw)
if ticket["status"] == "closed" then return false end
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
if ARGV[3] == "reply" then
  ticket["reply"] = ARGV[4]
  ticket["repliedAt"] = now
  ticket["status"] = "answered"
else
  ticket["status"] = "closed"
  ticket["closedAt"] = now
end
ticket["updatedAt"] = now
local encoded = cjson.encode(ticket)
redis.call("SET", KEYS[1], encoded, "EX", ttl)
redis.call("ZADD", KEYS[2], now, ARGV[5])
redis.call("EXPIRE", KEYS[2], ttl)
if KEYS[3] ~= "" then
  redis.call("EXPIRE", KEYS[3], ttl)
end
return encoded
`;

async function mutateTicket(redis: Redis, id: string, mode: "reply" | "close", reply: string, now: number): Promise<Ticket | null> {
  const current = asTicket(await redis.get(ticketKey(id)));
  const wallet = current ? walletKey(current.walletId) : "";
  const raw = (await redis.eval(
    TICKET_MUTATION,
    [ticketKey(id), adminKey(), wallet],
    [String(now), String(SUPPORT_TTL_SECONDS), mode, reply, id],
  )) as string | false | null;
  if (!raw || raw === "false") return null;
  try {
    return asTicket(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
}

async function decide(limiter: Ratelimit, id: string): Promise<LimitDecision> {
  try {
    const result = await limiter.limit(id);
    if (result.reason === "timeout") return "error";
    return result.success ? "allow" : "deny";
  } catch {
    return "error";
  }
}

export function redisLimits(redis: Redis, ipLimit: number, walletLimit: number): SupportLimits {
  const prefix = supportKeyPrefix();
  const ip = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(ipLimit, "10 m"), prefix: `${prefix}support:rl:ip`, timeout: 5000 });
  const wallet = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(walletLimit, "10 m"), prefix: `${prefix}support:rl:wallet`, timeout: 5000 });
  return {
    ip: (id) => decide(ip, id),
    wallet: (id) => decide(wallet, id),
  };
}

let devBackend: { tickets: TicketStore; limits: SupportLimits; ipLimit: number; walletLimit: number } | null = null;

export function resetDevSupport(): void {
  devBackend = null;
}

export function openSupport(ipLimit: number, walletLimit: number): { tickets: TicketStore; limits: SupportLimits } | null {
  if (kvConfigured()) {
    const redis = Redis.fromEnv();
    return { tickets: redisTicketStore(redis), limits: redisLimits(redis, ipLimit, walletLimit) };
  }
  if (!devStoreAllowed()) return null;
  if (!devBackend || devBackend.ipLimit !== ipLimit || devBackend.walletLimit !== walletLimit) {
    devBackend = {
      tickets: devBackend?.tickets ?? memoryTicketStore(),
      limits: memoryLimits(ipLimit, walletLimit),
      ipLimit,
      walletLimit,
    };
  }
  return { tickets: devBackend.tickets, limits: devBackend.limits };
}
