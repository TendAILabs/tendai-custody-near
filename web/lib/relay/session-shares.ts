export type ShareIdRow = { id: string };

export function filterSharesToSession<T extends ShareIdRow>(shares: readonly T[], sessionIds: readonly string[]): T[] {
  const allowed = new Set(sessionIds.filter((id) => id.length > 0));
  return shares.filter((share) => allowed.has(String(share.id)));
}
