"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WhatYouCanVerify } from "@/components/wireframe/activity/verify-panel";
import { ATTESTATION_URL, MODEL_ID } from "@/lib/fixtures";
import { isTxHash, txUrl } from "@/lib/near/explorer";
import { checkLabel, verificationRows, type CheckState } from "@/lib/near/proof";
import { useStory } from "@/lib/story-context";
import { SERVER_EVIDENCE_LABEL, evidencePresent, type TeeServerEvidence } from "@/lib/tee/evidence";
import { Btn, PageHead, Section, Tag } from "./c2";
import { GlossaryTip } from "./tip";

function receiptFields(raw: string): { signer: string; request: string; response: string } | null {
  try {
    const parsed = JSON.parse(raw) as { signer?: string; signedText?: string };
    const parts = (parsed.signedText ?? "").split(":");
    if (!parsed.signer || parts.length < 3) return null;
    return { signer: parsed.signer, request: parts[parts.length - 2] ?? "", response: parts[parts.length - 1] ?? "" };
  } catch {
    return null;
  }
}

function toneFor(state: CheckState): "ok" | "bad" | "qmut" {
  if (state === "pass") return "ok";
  if (state === "fail") return "bad";
  return "qmut";
}

const EVIDENCE_FIELDS: { key: keyof TeeServerEvidence; label: string }[] = [
  { key: "gatewayTcb", label: "Gateway TCB" },
  { key: "gatewaySigner", label: "Gateway signer" },
  { key: "gatewayTls", label: "Gateway TLS" },
  { key: "modelTcb", label: "Model TCB" },
  { key: "modelGpu", label: "Model GPU" },
  { key: "modelSigner", label: "Model signer" },
];

export function EvidenceFields({ evidence }: { evidence: TeeServerEvidence | null }) {
  return (
    <div data-testid="tee-evidence">
      <p>
        These fields come back with the sealed summary. A filled value was {SERVER_EVIDENCE_LABEL}. This browser did not verify the quote. Where a field is missing, it was not checked.
      </p>
      {EVIDENCE_FIELDS.map((field) => {
        const shown = evidencePresent(evidence?.[field.key]);
        return (
          <p key={field.key}>
            <b>{field.label}. </b>
            {shown ? `${shown}. ${SERVER_EVIDENCE_LABEL}.` : "Not checked"}
          </p>
        );
      })}
    </div>
  );
}

export function CheckList({ idPrefix = "verified-check" }: { idPrefix?: string }) {
  const { state } = useStory();
  const fields = receiptFields(state.teeReceipt);
  const rows = verificationRows({
    teeStatus: state.teeStatus,
    hasParsedReceipt: Boolean(fields),
    approveTxKnown: isTxHash(state.consentTx),
    evidence: state.teeEvidence,
  });
  return (
    <ol>
      {rows.map((check, index) => (
        <li key={check.id} data-testid={`${idPrefix}-${check.id}`} className={check.state === "fail" ? "c2-chk fail" : "c2-chk"}>
          <span className="n">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <b>{check.name}</b>
            <p>{check.detail}</p>
          </div>
          <Tag tone={toneFor(check.state)}>{checkLabel(check.state)}</Tag>
        </li>
      ))}
    </ol>
  );
}

export function VerifiedDrawer({ onClose }: { onClose: () => void }) {
  const { state } = useStory();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const intro =
    state.teeStatus === "green"
      ? "The summary call reported signature kind provider_tee. That is the check this page can make."
      : state.teeStatus === "red"
        ? "The summary call did not report provider_tee. Approve stays off."
        : "Run the sealed summary. Until then, this page has not checked a signature.";

  return (
    <div data-testid="verified-drawer" className="c2-inspect">
      <div className="c2-inspect-bar">
        <b>Inspect attestation</b>
        <Btn small tone="ghost" testId="close-verified" onClick={onClose}>
          Close
        </Btn>
      </div>
      <div className="c2-inspect-body">
        <p className="c2-lede">
          {intro} {state.tamper ? "A ciphertext byte was flipped in this browser. That check is on the tamper screen. It does not turn these rows green." : ""}
        </p>
        <EvidenceFields evidence={state.teeEvidence} />
        <CheckList idPrefix="verified-drawer-check" />
        <a href={ATTESTATION_URL} target="_blank" rel="noreferrer">
          NEAR AI explains attestation here. Opening it does not check this summary.
        </a>
      </div>
    </div>
  );
}

export function VerificationScreen({ titleAs: _titleAs = "h1" }: { titleAs?: "h1" | "h2" }) {
  const { state, ready, toggleTamper } = useStory();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fields = receiptFields(state.teeReceipt);
  const approveTx = isTxHash(state.consentTx) ? state.consentTx : null;
  const signature = !ready ? "loading" : state.tamper ? "tampered" : state.teeStatus === "green" ? state.teeNote || "provider_tee" : state.teeStatus === "red" ? state.teeNote || "not provider_tee" : "not run";
  const measured = state.summaryLatencyMs != null && state.summaryLatencyMs > 0;
  const seconds = measured ? (state.summaryLatencyMs! / 1000).toFixed(1) : "";
  const ruler = measured ? Math.min(100, state.summaryLatencyMs! / 1000 / 8 * 100) : 0;
  const green = !state.tamper && state.teeStatus === "green";

  return (
    <div>
      <PageHead
        eyebrow="Proof"
        title="Check the AI summary's"
        mark="receipt"
        what="This page checks that the summary came back signed as provider_tee."
        can="You can read the receipt, and you can try a tampered copy to see it refused."
        state={state}
        bad={state.tamper || state.teeStatus === "red"}
      />
      <div className="c2-cols" style={{ marginTop: 26, columnGap: 28 }}>
        <div>
          <div className="c2-navy" style={{ padding: "20px 24px 12px" }}>
            <div className="c2-row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <span className="c2-lab">
                <GlossaryTip id="attestation">Attestation</GlossaryTip> fields
              </span>
              <Tag tone={green ? "ok" : state.tamper || state.teeStatus === "red" ? "bad" : "qmut"}>{green ? "provider_tee" : signature}</Tag>
            </div>
            <dl className="c2-kv">
              <dt>Model</dt>
              <dd>{MODEL_ID}</dd>
              <dt>Signature</dt>
              <dd data-testid="signature-kind">
                <span className="g">{signature}</span>
              </dd>
              <dt>Signer</dt>
              <dd>{fields?.signer ?? "not run"}</dd>
              <dt>Request hash</dt>
              <dd>{fields?.request ?? "not run"}</dd>
              <dt>Response hash</dt>
              <dd>{fields?.response ?? "not run"}</dd>
              <dt>Server attestation</dt>
              <dd>
                <EvidenceFields evidence={state.teeEvidence} />
              </dd>
              <dt>Approve transaction</dt>
              <dd>
                {approveTx ? (
                  <a href={txUrl(approveTx)} target="_blank" rel="noreferrer">
                    {approveTx}
                  </a>
                ) : (
                  "No approve transaction is saved in this session."
                )}{" "}
                This page does not read the contract to confirm it.
              </dd>
            </dl>
          </div>
          <div className="c2-row" style={{ marginTop: 16 }}>
            <Btn small tone="ghost" onClick={() => setOpen(true)}>
              Inspect attestation
            </Btn>
            <Btn
              small
              tone="danger"
              testId="tamper-toggle"
              disabled={!ready}
              onClick={() => {
                if (!state.tamper) toggleTamper();
                router.push("/verification/tamper");
              }}
            >
              Try a tampered copy (should be refused)
            </Btn>
          </div>
          {open ? <VerifiedDrawer onClose={() => setOpen(false)} /> : null}
        </div>
        <div className="c2-side">
          <div className="c2-lab ink">Summary round trip · {measured ? "measured" : "waiting"}</div>
          <div className="c2-latency" style={{ marginTop: 12 }}>
            {measured ? (
              <>
                {seconds}
                <small>s</small>
              </>
            ) : (
              <span className="c2-unmeasured">Not measured</span>
            )}
          </div>
          <div className="c2-ruler">
            <i style={{ width: `${ruler}%` }} />
            <span style={{ left: 0 }}>0</span>
            <span style={{ left: "50%" }}>4</span>
            <span style={{ right: 0 }}>8 s</span>
          </div>
          <Section index="Checks" title="Only what was computed" aside="The rest are not checked here" delay={2}>
            <CheckList />
          </Section>
        </div>
      </div>
      <WhatYouCanVerify />
    </div>
  );
}
