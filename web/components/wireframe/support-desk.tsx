"use client";

import { useState, type FormEvent } from "react";
import { Btn } from "./c2";
import { connectTestnetWallet } from "@/lib/wallet/near-connect";
import { hexToBytes, supportMessage, type SupportAction } from "@/lib/support/message";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  reply: string;
  createdAt: number;
};

type Signed = { accountId: string; publicKey: string; signature: string; nonce: string };

async function sign(action: SupportAction, fields: { subject?: string; message?: string; ticketId?: string; reply?: string } = {}): Promise<Signed> {
  const challenge = await fetch("/api/support/challenge", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const issued = (await challenge.json()) as { nonce?: string; recipient?: string; error?: string };
  if (!challenge.ok || !issued.nonce || !issued.recipient) throw new Error(issued.error ?? "Sign-in could not start. Try again.");
  const nonce = hexToBytes(issued.nonce);
  if (!nonce) throw new Error("Sign-in could not start. Try again.");
  const connected = await connectTestnetWallet();
  if (connected.warning) throw new Error(connected.warning);
  const signed = await connected.signMessage({
    message: supportMessage(action, issued.nonce, fields),
    recipient: issued.recipient,
    nonce,
  });
  return {
    accountId: signed.accountId || connected.accountId,
    publicKey: signed.publicKey,
    signature: signed.signature,
    nonce: issued.nonce,
  };
}

export function SupportDesk() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<Ticket[] | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote("");
    try {
      const fields = { subject: subject.trim(), message: message.trim() };
      const proof = await sign("create", fields);
      const response = await fetch("/api/support", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", ...proof, ...fields }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The note was not saved.");
      setSubject("");
      setMessage("");
      setTickets(null);
      setNote("The note is saved. Sign in again to see your tickets.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The note was not saved.");
    } finally {
      setBusy(false);
    }
  }

  async function loadMine() {
    setBusy(true);
    setNote("");
    try {
      const proof = await sign("list");
      const response = await fetch("/api/support", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list", ...proof }),
      });
      const body = (await response.json()) as { error?: string; tickets?: Ticket[] };
      if (!response.ok) throw new Error(body.error ?? "The tickets could not be read.");
      setTickets(body.tickets ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The tickets could not be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="support" className="c2-sec" data-testid="contact-support" style={{ marginTop: 28 }}>
      <div className="c2-sec-h">
        <span className="t">
          Contact <em>support</em>
        </span>
      </div>
      <div className="c2-sec-b">
        <p>Sign in with your NEAR testnet wallet, then send a short note.</p>
        <p>This demo uses fictional data only. Leave out a real name, a real record number, and a real health detail.</p>
        <form className="c2-form" onSubmit={send}>
          <label>
            Subject
            <input value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} required />
          </label>
          <label>
            Message
            <textarea value={message} maxLength={2000} onChange={(event) => setMessage(event.target.value)} required />
          </label>
          <p className="hint">{message.trim().length} of 2000 characters.</p>
          <Btn type="submit" disabled={busy}>
            Sign in and send
          </Btn>
        </form>
        <div style={{ marginTop: 16 }}>
          <Btn tone="ghost" disabled={busy} onClick={loadMine}>
            Sign in to see my tickets
          </Btn>
        </div>
        {note ? <p data-testid="support-note">{note}</p> : null}
        {tickets ? (
          <div data-testid="my-tickets">
            {tickets.length === 0 ? <p>This wallet has no open tickets.</p> : null}
            {tickets.map((ticket) => (
              <article key={ticket.id}>
                <h3>{ticket.subject}</h3>
                <p>{ticket.status === "answered" ? "Answered" : "Open"}</p>
                <p>{ticket.message}</p>
                {ticket.reply ? <p>Reply: {ticket.reply}</p> : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
