import { randomBytes } from "node:crypto";

export const SUMMARY_SAFE_ERROR = "The summary could not be verified. Try again.";

export const SUMMARY_IDENTIFIER_ERROR = "summary kept a personal identifier";

export function summaryOutputRefused(error: unknown): boolean {
  return error instanceof Error && error.message === SUMMARY_IDENTIFIER_ERROR;
}

export function summaryFailure(error: unknown): { status: 502; body: { error: string }; log: string } {
  const correlation = randomBytes(8).toString("hex");
  return {
    status: 502,
    body: { error: SUMMARY_SAFE_ERROR },
    log: `[tee-summary] POST 502 correlation=${correlation} status=${sanitizedStatus(error)}`,
  };
}

function sanitizedStatus(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const match = /(?:^|[^0-9])(401|403|404|429|500|502)(?![0-9])/.exec(message);
  return match?.[1] ?? "unavailable";
}
