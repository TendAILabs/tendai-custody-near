"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { FAQ_HREF } from "@/lib/assist/copy";
import { useAsk } from "./ask-context";
import { ASSIST_MAX_INPUT, ASSIST_MAX_MESSAGES } from "@/lib/assist/limits";
import { normalizeRoute, roleForRoute, screenFor, SCREENS } from "@/lib/assist/screens";
import "./ask.css";

const LINKS = new Set(SCREENS.flatMap((item) => [item.route, item.nextHref]).filter((href) => !href.includes("[")));

type Receipt = { requestHash: string; responseHash: string };

type ChatItem = {
  id: number;
  role: "user" | "assistant";
  text: string;
  mac?: string;
  receipt?: Receipt;
  replaced?: string;
};

type AssistBody = {
  text?: string;
  error?: string;
  faq?: string;
  remaining?: number;
  replaced?: string;
  signatureKind?: string;
  requestHash?: string;
  responseHash?: string;
  turnMac?: string;
};

function presentError(status: number, error: string): string {
  if (status === 401) return "Press the Use the demo server account button on Maya's page, and then ask again.";
  if (status === 503) return "Ask TendAI is not available right now. The FAQ is still available.";
  return error || "Ask TendAI could not answer that. Try again.";
}

function AnswerText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const label = match[1] ?? "";
    const href = match[2] ?? "";
    if (index > last) parts.push(text.slice(last, index));
    parts.push(LINKS.has(href) ? <a key={`${href}-${index}`} href={href}>{label}</a> : label);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p>{parts}</p>;
}

export function AskTendAiClient() {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const { open, setOpen } = useAsk();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [error, setError] = useState("");
  const [faq, setFaq] = useState("");
  const [remaining, setRemaining] = useState(ASSIST_MAX_MESSAGES);
  const pathname = usePathname();
  const route = normalizeRoute(pathname ?? "/");
  const screen = screenFor(route);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTop = log.scrollHeight;
  }, [items, pending, open]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    void fetch("/api/demo/config", { credentials: "same-origin" }).catch(() => undefined);
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function trap(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>("button, textarea, a[href]")].filter(
      (item) => !item.hasAttribute("disabled"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending || remaining <= 0) return;
    setPending(true);
    setError("");
    setFaq("");
    const history = items.map((item) =>
      item.role === "assistant" ? { role: "assistant" as const, content: item.text, mac: item.mac } : { role: "user" as const, content: item.text },
    );
    try {
      const response = await fetch("/api/assist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: roleForRoute(route),
          route,
          messages: [...history, { role: "user", content: text }],
        }),
      });
      const body = (await response.json()) as AssistBody;
      if (typeof body.remaining === "number") setRemaining(body.remaining);
      if (!response.ok || !body.text) {
        setError(presentError(response.status, body.error ?? ""));
        setFaq(body.faq ?? (response.status === 429 || response.status === 422 ? FAQ_HREF : ""));
        if (response.status !== 422) setDraft(text);
        return;
      }
      const receipt =
        body.signatureKind === "provider_tee" && body.requestHash && body.responseHash
          ? { requestHash: body.requestHash, responseHash: body.responseHash }
          : undefined;
      setItems((current) => [
        ...current,
        { id: current.length + 1, role: "user", text },
        { id: current.length + 2, role: "assistant", text: body.text ?? "", mac: body.turnMac, receipt, replaced: body.replaced },
      ]);
      setDraft("");
    } catch {
      setError("Ask TendAI could not answer that. Try again.");
      setFaq(FAQ_HREF);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {open ? (
        <>
          <button type="button" className="ask-backdrop" aria-label="Close Ask TendAI" onClick={close} />
          <div
            ref={panelRef}
            id="ask-tendai-panel"
            className="ask-panel"
            data-testid="ask-tendai-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={trap}
          >
            <div className="ask-head">
              <div>
                <h2 id={titleId}>Ask TendAI</h2>
                <p>
                  Ask how this screen works. Answers are about the demo, and they are not medical advice. The design follows HIPAA principles.{" "}
                  <a href={FAQ_HREF}>FAQ</a>
                </p>
              </div>
              <button type="button" className="ask-close" onClick={close}>
                Close
              </button>
            </div>
            <div ref={logRef} className="ask-log" role="log" aria-live="polite" aria-relevant="additions" aria-busy={pending}>
              {items.length === 0 ? <p className="ask-empty">Ask what this screen does, what is on NEAR, or what revoke cannot do.</p> : null}
              {items.map((item) => (
                <div key={item.id} className={`ask-bubble ${item.role}`}>
                  <AnswerText text={item.text} />
                  {item.replaced ? <p className="ask-withheld">The sealed reply was withheld. The receipt is for that reply, which is not shown.</p> : null}
                  {item.receipt ? (
                    <a
                      className="ask-chip"
                      href="/verification"
                      aria-label={`Receipt provider_tee, request hash ${item.receipt.requestHash}, response hash ${item.receipt.responseHash}. Open the verification view.`}
                    >
                      <span>provider_tee</span>
                      <span>req {item.receipt.requestHash.slice(0, 8)}</span>
                      <span>res {item.receipt.responseHash.slice(0, 8)}</span>
                    </a>
                  ) : null}
                </div>
              ))}
              {error ? (
                <p className="ask-alert" role="alert">
                  {error} {faq ? <a href={faq}>Open the FAQ</a> : null}
                </p>
              ) : null}
            </div>
            <form className="ask-form" onSubmit={(event) => void send(event)}>
              <label htmlFor="ask-tendai-input">Your question</label>
              <textarea
                id="ask-tendai-input"
                data-testid="ask-tendai-input"
                maxLength={ASSIST_MAX_INPUT}
                value={draft}
                disabled={pending || remaining <= 0}
                placeholder="Ask about this screen"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <div className="ask-row">
                <span className="ask-left">
                  {draft.length} of {ASSIST_MAX_INPUT}. {remaining} of {ASSIST_MAX_MESSAGES} left.
                </span>
                <button className="ask-send" data-testid="ask-tendai-send" type="submit" disabled={pending || remaining <= 0 || draft.trim().length === 0}>
                  {pending ? "Sending" : "Send"}
                </button>
              </div>
            </form>
          </div>
        </>
      ) : null}
    </>
  );
}
