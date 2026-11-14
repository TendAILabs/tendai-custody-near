import { Suspense } from "react";
import { AskTendAiClient } from "./ask-tendai-client";
import "./ask.css";

export function AskTendAi() {
  return (
    <Suspense fallback={null}>
      <AskTendAiClient />
    </Suspense>
  );
}
