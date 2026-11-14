import { randomBytes } from "node:crypto";

export type WindowMember = { id: string; at: number };

export function uniqueMember(at: number): string {
  return `${at}:${randomBytes(8).toString("hex")}`;
}

export function pruneWindow(members: WindowMember[], now: number, windowMs: number): WindowMember[] {
  return members.filter((member) => now - member.at < windowMs && member.at <= now);
}

/**
 * Admit one unique member. Identical timestamps stay distinct because the member
 * id is not the timestamp. A repeated id replaces that one member and does not
 * raise the count.
 */
export function admitMember(
  members: WindowMember[],
  member: WindowMember,
  limit: number,
  now: number,
  windowMs: number,
): { ok: boolean; members: WindowMember[]; oldest: number } {
  const live = pruneWindow(members, now, windowMs).filter((item) => item.id !== member.id);
  if (live.length >= limit) {
    const oldest = Math.min(...live.map((item) => item.at));
    return { ok: false, members: live, oldest };
  }
  const next = [...live, member];
  return { ok: true, members: next, oldest: Math.min(...next.map((item) => item.at)) };
}

export function releaseMemberAt(members: WindowMember[], at: number, now: number, windowMs: number): WindowMember[] {
  const live = pruneWindow(members, now, windowMs);
  let index = -1;
  for (let cursor = live.length - 1; cursor >= 0; cursor -= 1) {
    if (live[cursor]?.at === at) {
      index = cursor;
      break;
    }
  }
  if (index < 0) return live;
  const next = live.slice();
  next.splice(index, 1);
  return next;
}

export const WINDOW_ADMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])
redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)
local count = redis.call("ZCARD", key)
if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  return {0, oldest[2] or tostring(now)}
end
redis.call("ZADD", key, now, member)
redis.call("PEXPIRE", key, ttl)
local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
return {1, oldest[2] or tostring(now)}
`;
