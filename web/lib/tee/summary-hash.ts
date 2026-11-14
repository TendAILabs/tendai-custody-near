export function isServerSummaryHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
