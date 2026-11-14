"use client";

import { useEffect, useState } from "react";
import { TEE_STAGES, type TeeStage } from "../lib/tee/completion";
import { evidencePhrase } from "../lib/tee/evidence";
import { REPLAYED_DEID, REPLAYED_SUMMARY } from "../lib/tee/replay";

type Mode = "replay" | "live";

export function TeeProgress() {
  const [mode, setMode] = useState<Mode>("replay");
  const [replayKey, setReplayKey] = useState(0);
  const [active, setActive] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Playing the cached verification.");
  const [liveEvidence, setLiveEvidence] = useState("");

  useEffect(() => {
    if (mode !== "replay") return;
    const timers = TEE_STAGES.map((_, index) =>
      window.setTimeout(() => {
        setActive(index);
        if (index === TEE_STAGES.length - 1) {
          window.setTimeout(() => setDone(true), 700);
        }
      }, index * 700),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [mode, replayKey]);

  async function runLive() {
    if (busy) return;
    setBusy(true);
    setMode("live");
    setActive(-1);
    setDone(false);
    setStatus("Checking for a NEAR AI key.");
    try {
    const response = await fetch("/api/tee/live", { method: "POST" });
    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus(payload.error ?? "Live call was not started.");
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const line = chunk.replace(/^data:\s*/, "");
        if (!line) continue;
        let event: {
          stage?: string;
          chars?: number;
          message?: string;
          gatewayTcb?: string;
          gatewaySigner?: string;
          gatewayTls?: string;
          modelTcb?: string;
          modelGpu?: string;
          modelSigner?: string;
        };
        try {
          event = JSON.parse(line) as typeof event;
        } catch {
          continue;
        }
        const index = TEE_STAGES.indexOf(event.stage as TeeStage);
        if (index >= 0) {
          setActive(index);
          setStatus(event.chars != null ? `In the TEE. Answer characters: ${event.chars}.` : stageLabel(event.stage as TeeStage));
        } else if (event.stage === "done") {
          setDone(true);
          setLiveEvidence(
            [
              evidencePhrase("Gateway TCB", event.gatewayTcb),
              evidencePhrase("Gateway signer", event.gatewaySigner),
              evidencePhrase("Gateway TLS", event.gatewayTls),
              evidencePhrase("Model TCB", event.modelTcb),
              evidencePhrase("Model GPU", event.modelGpu),
              evidencePhrase("Model signer", event.modelSigner),
            ].join(" "),
          );
          setStatus("Live verification finished. The answer text stays on the server. Checked by our server via the NEAR AI SDK at call time, not in this browser.");
        } else if (event.stage === "error") {
          setStatus(event.message ?? "Live call failed.");
        }
      }
    }
    } catch {
      setStatus("Live call was not started.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 p-5" aria-labelledby="tee-progress-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="tee-progress-title" className="text-lg font-semibold text-slate-900">
          Private summary
        </h2>
        <p className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-950">
          {mode === "replay" ? "Replayed" : "Live"}
        </p>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">
        Guided Demo Mode plays a cached verification from the full-reasoning run so a judge is not waiting 30 to 40
        seconds. It is labeled Replayed. Run live starts a new attested call and shows the same stages.
      </p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-4" aria-label="TEE progress">
        {TEE_STAGES.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === active ? "step" : undefined}
            className={`rounded-xl px-3 py-2 text-sm ${index <= active ? "bg-teal-50 text-teal-950" : "bg-slate-50 text-slate-500"}`}
          >
            {stageLabel(stage)}
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-slate-700" role="status">
        {status}
      </p>
      {done && mode === "live" && liveEvidence ? <p className="mt-3 text-sm leading-6 text-slate-800">{liveEvidence}</p> : null}
      {done && mode === "replay" ? (
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-800 sm:grid-cols-2">
          <p>
            Summary {REPLAYED_SUMMARY.label}. {REPLAYED_SUMMARY.signatureKind}, gateway and model TCB{" "}
            {REPLAYED_SUMMARY.gatewayTcb}, TLS {REPLAYED_SUMMARY.tls}, GPU {REPLAYED_SUMMARY.gpu}.{" "}
            {REPLAYED_SUMMARY.completionTokens} completion tokens, {REPLAYED_SUMMARY.latencyMs / 1000}s.{" "}
            {REPLAYED_SUMMARY.note}
          </p>
          <p>
            De-identification {REPLAYED_DEID.label}. max_tokens {REPLAYED_DEID.maxTokens},{" "}
            {REPLAYED_DEID.reasoningTokens} reasoning tokens, {REPLAYED_DEID.fixtureIdentifiers} fixture identifiers,{" "}
            {REPLAYED_DEID.privacySpans} privacy-filter spans, share {REPLAYED_DEID.shareAllowed ? "allowed" : "blocked"}.{" "}
            {REPLAYED_DEID.note}
          </p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800"
          onClick={() => {
            setMode("replay");
            setActive(0);
            setDone(false);
            setStatus("Playing the cached verification.");
            setReplayKey((key) => key + 1);
          }}
        >
          Play replay
        </button>
        <button
          type="button"
          className="rounded-full bg-teal-800 px-4 py-2 text-sm font-medium text-white"
          disabled={busy}
          onClick={() => void runLive()}
        >
          Run live
        </button>
      </div>
    </section>
  );
}

function stageLabel(stage: TeeStage): string {
  if (stage === "attesting") return "Attesting";
  if (stage === "encrypting") return "Encrypting";
  if (stage === "in TEE") return "In TEE";
  return "Verifying";
}
