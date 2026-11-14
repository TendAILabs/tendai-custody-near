export const DEID_CLIENT_TIMEOUT_MS = 290_000;

export const DEID_TIMEOUT_MESSAGE = "This de-identification pass took too long. Wait a moment, then run the leak scan again.";

export function deidClientFailure(error: unknown): string {
  if (isDeidTimeout(error)) return DEID_TIMEOUT_MESSAGE;
  if (error instanceof Error && error.message) return error.message;
  return "The de-identification pass did not finish. Run the leak scan again.";
}

function isDeidTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) return false;
  const name = String((error as { name?: unknown }).name);
  return name === "TimeoutError" || name === "AbortError";
}
