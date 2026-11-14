import { TEE_MODEL } from "../relay/policy.ts";

export const ASSIST_MODEL_DEFAULT = TEE_MODEL;
export const ASSIST_MAX_INPUT = 1000;
export const ASSIST_MAX_MESSAGES = 8;
export const ASSIST_MAX_TOKENS = 300;
export const ASSIST_DAY_LIMIT = 100;
export const ASSIST_IP_DAY_LIMIT = 24;
export const ASSIST_MAX_TOTAL = 6000;
export const ASSIST_SESSION_TTL_SECONDS = 12 * 60 * 60;

export function assistModelId(override?: string): string {
  if (override !== undefined) return override.trim() || ASSIST_MODEL_DEFAULT;
  return process.env.ASSIST_MODEL?.trim() || ASSIST_MODEL_DEFAULT;
}
