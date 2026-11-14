import { canonicalU64 } from "../ids.ts";
import type { OpenDeps } from "./handle.ts";
import { viewMethod } from "../near/views.ts";

type ShareView = {
  effective_status?: string;
  artifact_hash?: string | null;
};

type RecordView = {
  sections?: { cipher_hash: string }[];
};

export function chainOpenDeps(contractId: string): OpenDeps {
  return {
    checkTicket: async ({ kind, id, accountId, nonceHash }) => {
      const canonical = canonicalU64(id);
      if (!canonical) return false;
      const method = kind === "share" ? "check_ticket" : "check_record_ticket";
      const args =
        kind === "share"
          ? { share_id: canonical, account_id: accountId, nonce_hash: nonceHash }
          : { record_id: canonical, account_id: accountId, nonce_hash: nonceHash };
      return viewMethod<boolean>(contractId, method, args);
    },
    effectiveStatus: async ({ kind, id }) => {
      const canonical = canonicalU64(id);
      if (!canonical) return null;
      if (kind === "record") return "Active";
      const share = await viewMethod<ShareView | null>(contractId, "get_share", { share_id: canonical });
      return share?.effective_status ?? null;
    },
    blobHashes: async ({ kind, id }) => {
      const canonical = canonicalU64(id);
      if (!canonical) return [];
      if (kind === "share") {
        const share = await viewMethod<ShareView | null>(contractId, "get_share", { share_id: canonical });
        return share?.artifact_hash ? [share.artifact_hash] : [];
      }
      const record = await viewMethod<RecordView | null>(contractId, "get_record", { record_id: canonical });
      return (record?.sections ?? []).map((section) => section.cipher_hash);
    },
  };
}
