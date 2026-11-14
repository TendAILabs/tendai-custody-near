// Concurrent ticket replay against the in-memory used-nonce set.
// Run: node --experimental-strip-types docs/redteam/repros/replay-race.mjs

import { handleOpen, resetUsedNonces } from "../../../web/lib/open/handle.ts";

const nonce = "22".repeat(32);
const blob = new TextEncoder().encode("fictional-ciphertext");
const deps = {
  checkTicket: async () => true,
  effectiveStatus: async () => "Active",
  blobHashes: async () => ["ab".repeat(32)],
  readBlob: async () => blob,
};
resetUsedNonces();
const body = { account_id: "hospital.testnet", nonce, share_id: "9" };
const responses = await Promise.all([handleOpen(body, deps), handleOpen(body, deps), handleOpen(body, deps)]);
const statuses = [];
for (const response of responses) statuses.push(response.status);
const ok = statuses.filter((status) => status === 200).length;
console.log(JSON.stringify({ statuses, concurrentOpens: ok, replayHeld: ok === 1 }));
