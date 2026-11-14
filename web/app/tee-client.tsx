"use client";

import { InferenceClient } from "@nearai/inference-sdk";

export function TeeSdkProbe() {
  const loaded = typeof InferenceClient === "function";
  return (
    <p className="text-sm text-slate-600">
      Browser SDK entry <code>InferenceClient</code> is {loaded ? "in this bundle" : "missing"}. This page does not
      call NEAR AI.
    </p>
  );
}
