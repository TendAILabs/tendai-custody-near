import { clientIp } from "../guard/visitor.ts";
import { stateChangeGuard } from "../http/origin.ts";
import { assistHasPersonalIdentifier } from "./demo-names.ts";
import { assertTeeModel } from "../relay/policy.ts";
import {
  callWasNotSent,
  chargeAi,
  configuredKey,
  configuredSecret,
  deny,
  refundAi,
  requireVisitor,
  UNAVAILABLE,
  type GuardOptions,
} from "../tee/ai-guard.ts";
import { assistDayCount, assistStore, nextUtcMidnight, releaseAssistDay, releaseAssistIp, releaseSession, sessionCount, takeAssistDay, takeAssistIp, takeSession } from "./budget.ts";
import {
  ASSIST_SAFE_ERROR,
  DAY_CAP_MESSAGE,
  FAQ_HREF,
  IP_CAP_MESSAGE,
  HISTORY_INVALID,
  LENGTH_EXPLANATION,
  MEDICAL_REFUSAL,
  PHI_EXPLANATION,
  PROMPT_REFUSAL,
  SESSION_CAP_MESSAGE,
} from "./copy.ts";
import { assistModelId, ASSIST_DAY_LIMIT, ASSIST_MAX_INPUT, ASSIST_MAX_MESSAGES, ASSIST_MAX_TOKENS, ASSIST_MAX_TOTAL } from "./limits.ts";
import { boundUserText, buildAssistPrompt } from "./prompt.ts";
import { asksForMedicalAdvice, asksToBreakRules, givesMedicalAdvice, sanitizeAnswer, stripThinkingFields } from "./sanitize.ts";
import { normalizeRoute, screenFor } from "./screens.ts";
import { signAssistTurn, verifyAssistTurn } from "./turn-mac.ts";
import { ASSIST_ROLES, type AssistAnswer, type AssistModelResult, type AssistRole, type AssistTurn } from "./types.ts";

const HASH = /^[0-9a-f]{64}$/;

export type AssistDeps = GuardOptions & {
  secret?: string;
  keyConfigured?: boolean;
  modelId?: string;
  answer?: AssistAnswer;
};

type Parsed =
  | { ok: true; turns: AssistTurn[]; route: string; blocked: "medical" | "prompt" | null }
  | { ok: false; status: 400 | 422 | 429; error: string };

function noStore(body: Record<string, unknown>, status: number, retryAfter?: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (retryAfter) headers.set("retry-after", retryAfter);
  return Response.json(body, { status, headers });
}

function cap(error: string, retryAt?: string, retryAfter?: string, remaining = 0): Response {
  return noStore({ error, faq: FAQ_HREF, remaining, ...(retryAt ? { retryAt } : {}) }, 429, retryAfter);
}

function readTurns(
  messages: unknown,
  sid: string,
  secret: string,
): { ok: true; turns: AssistTurn[]; blocked: "medical" | "prompt" | null } | { ok: false; status: 400 | 422 | 429; error: string } {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > ASSIST_MAX_MESSAGES * 2) {
    return { ok: false, status: 400, error: "bad request" };
  }
  const turns: AssistTurn[] = [];
  let users = 0;
  let assistants = 0;
  let total = 0;
  let blocked: "medical" | "prompt" | null = null;
  const prior: AssistTurn[] = [];
  for (const item of messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return { ok: false, status: 400, error: "bad request" };
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      return { ok: false, status: 400, error: "bad request" };
    }
    total += content.length;
    if (total > ASSIST_MAX_TOTAL) return { ok: false, status: 400, error: LENGTH_EXPLANATION };
    if (role === "assistant") {
      const mac = (item as { mac?: unknown }).mac;
      if (typeof mac !== "string" || !verifyAssistTurn(secret, sid, assistants, prior, content, mac)) {
        return { ok: false, status: 400, error: HISTORY_INVALID };
      }
      assistants += 1;
      const assistant = { role: "assistant", content } as const;
      turns.push(assistant);
      prior.push(assistant);
      continue;
    }
    if (content.length > ASSIST_MAX_INPUT) return { ok: false, status: 400, error: LENGTH_EXPLANATION };
    // Encoded or translated text is not decoded here. The model still sees the original message.
    if (assistHasPersonalIdentifier(content)) return { ok: false, status: 422, error: PHI_EXPLANATION };
    if (asksForMedicalAdvice(content) || givesMedicalAdvice(content)) blocked = blocked ?? "medical";
    if (asksToBreakRules(content)) blocked = blocked ?? "prompt";
    users += 1;
    const user = { role: "user", content } as const;
    turns.push(user);
    prior.push(user);
  }
  if (users === 0 || users > ASSIST_MAX_MESSAGES || turns[turns.length - 1]?.role !== "user") {
    return { ok: false, status: users > ASSIST_MAX_MESSAGES ? 429 : 400, error: users > ASSIST_MAX_MESSAGES ? SESSION_CAP_MESSAGE : "bad request" };
  }
  const latest = turns[turns.length - 1]?.content.trim() ?? "";
  if (!latest) return { ok: false, status: 400, error: "empty message" };
  return { ok: true, turns, blocked };
}

function allowedRole(role: unknown): role is AssistRole | undefined {
  return role === undefined || (typeof role === "string" && (ASSIST_ROLES as readonly string[]).includes(role));
}

function parseBody(parsed: unknown, sid: string, secret: string): Parsed {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, status: 400, error: "bad request" };
  const body = parsed as { messages?: unknown; route?: unknown; role?: unknown };
  if (!allowedRole(body.role)) return { ok: false, status: 400, error: "bad request" };
  const turns = readTurns(body.messages, sid, secret);
  if (!turns.ok) return turns;
  return { ok: true, turns: turns.turns, route: normalizeRoute(body.route), blocked: turns.blocked };
}

function modelTurns(turns: AssistTurn[]): AssistTurn[] {
  return turns.map((turn) =>
    turn.role === "user" ? { role: "user", content: boundUserText(turn.content.slice(0, ASSIST_MAX_INPUT)) } : { role: "assistant", content: turn.content },
  );
}

function signedReply(
  body: Record<string, unknown>,
  secret: string,
  sid: string,
  prior: AssistTurn[],
  index: number,
  text: string,
): Response {
  return noStore({ ...body, turnMac: signAssistTurn(secret, sid, index, prior, text), turnIndex: index }, 200);
}

async function defaultAnswer(input: Parameters<AssistAnswer>[0]): Promise<AssistModelResult> {
  const { assistCompletion } = await import("./live.ts");
  return assistCompletion(input);
}

function friendlyLimit(error: string): string {
  if (error.includes("Too many tries")) return IP_CAP_MESSAGE;
  return DAY_CAP_MESSAGE;
}

async function withBudgetFaq(response: Response): Promise<Response> {
  let retryAt: string | undefined;
  let error = DAY_CAP_MESSAGE;
  try {
    const body = (await response.json()) as { error?: string; retryAt?: string };
    if (typeof body.error === "string") error = friendlyLimit(body.error);
    if (typeof body.retryAt === "string") retryAt = body.retryAt;
  } catch {
    error = DAY_CAP_MESSAGE;
  }
  return cap(error, retryAt, response.headers.get("retry-after") ?? undefined);
}

function verified(result: AssistModelResult, remaining: number, secret: string, sid: string, prior: AssistTurn[], index: number): Response {
  const clean = stripThinkingFields(result) as AssistModelResult;
  if (clean.signatureKind !== "provider_tee" || !HASH.test(clean.requestHash) || !HASH.test(clean.responseHash)) {
    throw new Error(`NEAR AI signatureKind=${clean.signatureKind}. provider_tee is required.`);
  }
  const answer = sanitizeAnswer(clean.text);
  return signedReply(
    {
      text: answer.text,
      signatureKind: "provider_tee",
      requestHash: clean.requestHash,
      responseHash: clean.responseHash,
      signer: clean.signer,
      receiptJson: clean.receiptJson,
      faq: FAQ_HREF,
      remaining,
      ...(answer.replaced ? { replaced: answer.replaced } : {}),
    },
    secret,
    sid,
    prior,
    index,
    answer.text,
  );
}

export async function handleAssist(request: Request, deps?: AssistDeps): Promise<Response> {
  const guarded = stateChangeGuard(request);
  if (guarded) return guarded;
  const started = performance.now();
  const now = deps?.now ?? Date.now();
  const store = deps?.store ?? assistStore();
  const guard = { now, store: deps?.store };
  const finish = (status: number, response: Response) => {
    console.log(`[assist] POST ${status} ${Math.round(performance.now() - started)}ms`);
    return response;
  };
  const secret = configuredSecret(deps?.secret);
  const visitor = requireVisitor(request, secret, now);
  if (!visitor.ok) return finish(visitor.response.status, visitor.response);
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    parsed = null;
  }
  const body = parsed === null ? ({ ok: false, status: 400, error: "bad request" } as const) : parseBody(parsed, visitor.session.sid, secret);
  if (!body.ok) {
    const status = body.status;
    return finish(status, noStore({ error: body.error, ...(status === 422 || status === 429 ? { faq: FAQ_HREF } : {}) }, status));
  }
  const ip = clientIp(request);
  if (!(await takeAssistIp(store, ip, now))) return finish(429, cap(IP_CAP_MESSAGE, nextUtcMidnight(now)));
  const used = await sessionCount(store, visitor.session.sid);
  if (used >= ASSIST_MAX_MESSAGES) {
    await releaseAssistIp(store, ip, now);
    return finish(429, cap(SESSION_CAP_MESSAGE));
  }
  if (body.blocked) {
    const remaining = Math.max(0, ASSIST_MAX_MESSAGES - (await sessionCount(store, visitor.session.sid)));
    const text = body.blocked === "medical" ? MEDICAL_REFUSAL : PROMPT_REFUSAL;
    const index = body.turns.filter((turn) => turn.role === "assistant").length;
    return finish(200, signedReply({ text, blocked: body.blocked, faq: FAQ_HREF, remaining }, secret, visitor.session.sid, body.turns, index, text));
  }
  if (!configuredKey(deps?.keyConfigured)) return finish(503, deny(503, UNAVAILABLE));
  if ((await assistDayCount(store, now)) >= ASSIST_DAY_LIMIT) {
    return finish(429, cap(DAY_CAP_MESSAGE, nextUtcMidnight(now)));
  }
  const model = assistModelId(deps?.modelId);
  try {
    assertTeeModel(model);
  } catch {
    return finish(503, deny(503, UNAVAILABLE));
  }
  const limited = await chargeAi(request, guard);
  if (limited) return finish(429, await withBudgetFaq(limited));
  const dayTaken = await takeAssistDay(store, now);
  if (!dayTaken) {
    await refundAi(request, guard);
    return finish(429, cap(DAY_CAP_MESSAGE, nextUtcMidnight(now)));
  }
  const sessionTaken = await takeSession(store, visitor.session.sid);
  if (!sessionTaken) {
    await releaseAssistDay(store, now);
    await refundAi(request, guard);
    return finish(429, cap(SESSION_CAP_MESSAGE));
  }
  const release = async () => {
    await refundAi(request, guard);
    await releaseAssistDay(store, now);
    await releaseSession(store, visitor.session.sid);
    await releaseAssistIp(store, ip, now);
  };
  try {
    const answer = deps?.answer ?? defaultAnswer;
    const screen = screenFor(body.route);
    const result = await answer({
      system: buildAssistPrompt(screen.route),
      turns: modelTurns(body.turns),
      maxTokens: ASSIST_MAX_TOKENS,
      model,
    });
    const remaining = Math.max(0, ASSIST_MAX_MESSAGES - (await sessionCount(store, visitor.session.sid)));
    const index = body.turns.filter((turn) => turn.role === "assistant").length;
    return finish(200, verified(result, remaining, secret, visitor.session.sid, body.turns, index));
  } catch (error) {
    if (callWasNotSent(error)) await release();
    return finish(502, noStore({ error: ASSIST_SAFE_ERROR, faq: FAQ_HREF }, 502));
  }
}
