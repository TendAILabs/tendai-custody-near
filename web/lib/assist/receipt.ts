const HASH = /^[0-9a-f]{64}$/i;

export function hashesFromSignedText(signedText: string): { requestHash: string; responseHash: string } | null {
  const parts = signedText.split(":");
  if (parts.length < 3) return null;
  const requestHash = (parts[parts.length - 2] ?? "").toLowerCase();
  const responseHash = (parts[parts.length - 1] ?? "").toLowerCase();
  if (!HASH.test(requestHash) || !HASH.test(responseHash)) return null;
  return { requestHash, responseHash };
}
