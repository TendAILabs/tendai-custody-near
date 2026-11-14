"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { ExpiryDays, SectionKey } from "./fixtures";
import {
  approveReferral,
  declineShare,
  openShare,
  revokeAllForRecord,
  revokeShare,
  runTeeSummary,
  sendClinicReferral,
  sendDeid,
  sendSecondOpinion,
  sharesForRecipient,
  submitConsult,
} from "./relay/flow";
import {
  freshStory,
  loadStory,
  saveStory,
  storyReducer,
  type ShareTarget,
  type Story,
  type StoryAction,
} from "./story";
import { rememberCiphertext } from "./blob/client-cache";
import { DEID_CLIENT_TIMEOUT_MS, DEID_TIMEOUT_MESSAGE, deidClientFailure } from "./tee/deid-timeout";

function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (!message || /blob put failed|sign in required|^sign failed$|bad request|bad origin/i.test(message)) {
    return "That step did not go through. Choose Use the demo server account on Maya's page if you have not yet, and then try again.";
  }
  if (/^ERR_[A-Z0-9_]+$/.test(message) || message.startsWith("Riverbend") || message.startsWith("Maya") || message.startsWith("The ") || message.startsWith("This ")) {
    return message;
  }
  return "That step did not go through. Try it again.";
}

function createApi(dispatch: Dispatch<StoryAction>, getState: () => Story, setActivity: (value: string | null) => void) {
  return {
    reset: () => dispatch({ type: "reset" }),
    seedMaya: () => dispatch({ type: "seed-maya" }),
    startDemo: () => dispatch({ type: "start-demo" }),
    setDemoStep: (step: number) => dispatch({ type: "set-demo-step", step }),
    toggleRequested: (key: SectionKey) => dispatch({ type: "toggle-requested", key }),
    toggleIncludeCounseling: () => dispatch({ type: "toggle-include-counseling" }),
    setPurpose: (purpose: string) => dispatch({ type: "set-purpose", purpose }),
    sendReferral: async () => {
      const state = getState();
      try {
        const result = await sendClinicReferral(state.requestedSections, state.purpose);
        dispatch({ type: "chain-referral", tx: result.tx, recordTx: result.recordTx, recordId: result.recordId, shareId: result.shareId });
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
      }
    },
    toggleGranted: (key: SectionKey) => dispatch({ type: "toggle-granted", key }),
    toggleGrantCounseling: () => dispatch({ type: "toggle-grant-counseling" }),
    setExpiry: (days: ExpiryDays) => dispatch({ type: "set-expiry", days }),
    toggleReadOnly: () => dispatch({ type: "toggle-read-only" }),
    runSummary: async () => {
      const state = getState();
      if (!state.shareId) {
        dispatch({
          type: "chain-summary",
          ok: false,
          note: "Riverbend Family Clinic hasn't sent a referral yet.",
          text: "",
          receipt: "",
          receiptHash: "",
          latencyMs: 0,
          evidence: null,
        });
        return;
      }
      setActivity("Attesting, then summarizing in the TEE");
      try {
        const result = await runTeeSummary(state.grantedSections, state.shareId);
        dispatch({
          type: "chain-summary",
          ok: result.ok,
          note: result.note,
          text: result.text,
          receipt: result.receipt,
          receiptHash: result.receiptHash,
          latencyMs: result.latencyMs,
          evidence: result.evidence,
        });
      } catch (error) {
        dispatch({ type: "chain-summary", ok: false, note: failure(error), text: "", receipt: "", receiptHash: "", latencyMs: 0, evidence: null });
      } finally {
        setActivity(null);
      }
    },
    approve: async () => {
      const state = getState();
      if (!state.recordId || !state.shareId) {
        dispatch({ type: "chain-error", message: "Riverbend Family Clinic hasn't sent a referral yet." });
        return;
      }
      try {
        const approved = await approveReferral({
          recordId: state.recordId,
          shareId: state.shareId,
          sections: state.grantedSections,
          days: state.expiryDays,
          readOnly: state.readOnly,
          receiptHash: state.summaryReceiptHash,
        });
        dispatch({ type: "chain-approve", tx: approved.tx, artifactHash: approved.artifactHash });
        return approved.tx;
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
        throw error;
      }
    },
    decline: async () => {
      const state = getState();
      if (!state.shareId) {
        dispatch({ type: "chain-error", message: "Riverbend Family Clinic hasn't sent a referral yet." });
        throw new Error("Riverbend Family Clinic hasn't sent a referral yet.");
      }
      try {
        const tx = await declineShare(state.shareId);
        dispatch({ type: "chain-decline", tx });
        return tx;
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
        throw error;
      }
    },
    openHospital: async () => {
      const state = getState();
      if (!state.shareId) {
        dispatch({ type: "open-hospital" });
        return;
      }
      try {
        const opened = await openShare("hospital", state.shareId, { tamper: state.tamper });
        dispatch({ type: "chain-open", tx: opened.hash });
      } catch (error) {
        const message = failure(error);
        if (message.includes("ERR_REVOKED") || message === "revoked") dispatch({ type: "open-hospital" });
        else if (message.includes("envelope swap")) dispatch({ type: "tamper-blocked" });
        else dispatch({ type: "chain-error", message });
      }
    },
    toggleTamper: () => dispatch({ type: "toggle-tamper" }),
    sendConsult: async (note: string) => {
      const state = getState();
      const trimmed = note.trim();
      if (!state.shareId || trimmed === "") {
        dispatch({ type: "chain-error", message: "No on-chain share to reply to." });
        return;
      }
      try {
        const tx = await submitConsult("hospital", state.shareId, trimmed);
        dispatch({ type: "chain-consult", tx, note: trimmed });
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
      }
    },
    setSecondExpiry: (days: ExpiryDays) => dispatch({ type: "set-second-expiry", days }),
    sendSecond: async (sections?: SectionKey[]) => {
      const state = getState();
      if (!state.recordId || !state.shareId) {
        dispatch({ type: "chain-error", message: "Riverbend Family Clinic hasn't sent a referral yet." });
        return;
      }
      if (state.consentStatus !== "active") {
        dispatch({ type: "chain-error", message: "Approve the hospital referral before sending a second opinion." });
        return;
      }
      const chosen = (sections ?? state.grantedSections).filter((key) => state.grantedSections.includes(key));
      if (chosen.length === 0) {
        dispatch({ type: "chain-error", message: "Pick at least one section for Dr. Reyes, including imaging or notes." });
        return;
      }
      try {
        const result = await sendSecondOpinion(state.recordId, state.shareId, chosen, state.secondExpiry);
        dispatch({ type: "chain-second", tx: result.tx, shareId: result.shareId });
        return result.tx;
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
        throw error;
      }
    },
    openSecond: async () => {
      const state = getState();
      if (!state.secondShareId) {
        dispatch({ type: "open-second" });
        return;
      }
      try {
        await openShare("second", state.secondShareId);
        dispatch({ type: "open-second" });
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
      }
    },
    sendSecondReply: async (note: string) => {
      const state = getState();
      const trimmed = note.trim();
      if (!state.secondShareId || trimmed === "") {
        dispatch({ type: "chain-error", message: "No second-opinion share to reply to." });
        return;
      }
      try {
        const tx = await submitConsult("second", state.secondShareId, trimmed);
        dispatch({ type: "chain-second-reply", tx, note: trimmed });
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
      }
    },
    runLeak: async () => {
      setActivity("Scrubbing, then the TEE de-identification pass");
      try {
        const response = await fetch("/api/tee/deid", { method: "POST", signal: AbortSignal.timeout(DEID_CLIENT_TIMEOUT_MS) });
        if (response.status === 504) {
          dispatch({ type: "chain-error", message: DEID_TIMEOUT_MESSAGE });
          return;
        }
        const body = (await response.json()) as {
          ok?: boolean;
          before?: string;
          after?: string;
          stage?: string;
          reason?: string;
          error?: string;
          receiptHash?: string;
          artifactHash?: string;
          artifactBase64?: string;
        };
        const reason = body.reason ?? body.error ?? "de-identification failed";
        const leakHit =
          body.stage === "leak-scan" || body.stage === "local" || reason.includes("identifier") || reason.includes("span");
        if (body.ok && body.after && body.receiptHash && body.artifactHash && body.artifactBase64) {
          if (!rememberCiphertext(body.artifactHash, body.artifactBase64)) {
            dispatch({
              type: "chain-error",
              message: "The stripped copy did not check out. Run the leak scan again.",
            });
            return;
          }
          dispatch({
            type: "chain-leak",
            scan: "clean",
            before: body.before ?? "",
            after: body.after,
            receiptHash: body.receiptHash,
            artifactHash: body.artifactHash,
          });
        } else if (leakHit) {
          dispatch({ type: "chain-leak", scan: "hit", before: body.before ?? "", after: body.after ?? "" });
        } else {
          dispatch({ type: "chain-error", message: reason });
        }
      } catch (error) {
        dispatch({ type: "chain-error", message: deidClientFailure(error) });
      } finally {
        setActivity(null);
      }
    },
    sendDeid: async () => {
      const state = getState();
      if (!state.recordId || state.leakScan !== "clean") {
        dispatch({
          type: "chain-error",
          message: "The leak scan has not cleared this copy. Run the scan, then send again when it says clear.",
        });
        return;
      }
      try {
        if (!state.deidReceiptHash || !state.deidArtifactHash) {
          dispatch({ type: "chain-error", message: "The leak scan has not cleared this copy. Run the scan, then send again when it says clear." });
          return;
        }
        const result = await sendDeid(state.recordId, state.deidAfter, state.deidReceiptHash, state.deidArtifactHash);
        dispatch({ type: "chain-deid", tx: result.tx, shareId: result.shareId });
        return result.tx;
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
        throw error;
      }
    },
    openDeid: async () => {
      const state = getState();
      if (!state.deidShareId) {
        dispatch({ type: "open-deid" });
        return;
      }
      try {
        await openShare("app", state.deidShareId);
        dispatch({ type: "open-deid" });
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
      }
    },
    noteTransfer: () => dispatch({ type: "note-transfer" }),
    revoke: async (target: ShareTarget) => {
      const state = getState();
      const shareId = target === "referral" ? state.shareId : target === "second" ? state.secondShareId : state.deidShareId;
      if (!shareId) {
        dispatch({ type: "revoke", target });
        return;
      }
      try {
        const tx = await revokeShare(shareId);
        dispatch({ type: "chain-revoke", target, tx });
        return tx;
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
        throw error;
      }
    },
    revokeAll: async () => {
      const state = getState();
      if (!state.recordId) {
        dispatch({ type: "chain-error", message: "No record to revoke." });
        throw new Error("No record to revoke.");
      }
      try {
        const tx = await revokeAllForRecord(state.recordId);
        dispatch({ type: "chain-revoke-all", tx });
        return tx;
      } catch (error) {
        dispatch({ type: "chain-error", message: failure(error) });
        throw error;
      }
    },
    sessionShareIds: () => {
      const state = getState();
      return [state.shareId, state.secondShareId, state.deidShareId].filter((id): id is string => Boolean(id));
    },
    sharesForRole: async (role: "hospital" | "second" | "app") => {
      const state = getState();
      const ids = [state.shareId, state.secondShareId, state.deidShareId].filter((id): id is string => Boolean(id));
      return sharesForRecipient(role, ids);
    },
    markBlocked: () => dispatch({ type: "blocked-attempt" }),
    markProof: () => dispatch({ type: "mark-proof" }),
  };
}

type StoryApi = ReturnType<typeof createApi>;

interface StoryContextValue extends StoryApi {
  state: Story;
  ready: boolean;
  activity: string | null;
}

const StoryContext = createContext<StoryContextValue | null>(null);

export function StoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storyReducer, undefined, freshStory);
  const [ready, setReady] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const api = useMemo(() => createApi(dispatch, () => stateRef.current, setActivity), []);

  useEffect(() => {
    const loaded = loadStory();
    if (loaded) dispatch({ type: "hydrate", story: loaded });
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveStory(state);
  }, [ready, state]);

  const value = useMemo(() => ({ state, ready, activity, ...api }), [state, ready, activity, api]);
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory(): StoryContextValue {
  const value = useContext(StoryContext);
  if (!value) {
    throw new Error("useStory must be used inside StoryProvider");
  }
  return value;
}
