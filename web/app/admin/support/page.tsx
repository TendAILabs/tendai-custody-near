"use client";

import { useState } from "react";
import { Btn } from "@/components/wireframe/c2";
import { connectTestnetWallet } from "@/lib/wallet/near-connect";
import { hexToBytes, supportMessage } from "@/lib/support/message";

type Ticket = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "answered" | "closed";
  reply: string;
};

async function ownerSign(action: "admin" | "reply" | "close", fields: { ticketId?: string; reply?: string } = {}) {
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

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setNote("");
    try {
      const proof = await ownerSign("admin");
      const response = await fetch("/api/support/admin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "admin", ...proof }),
      });
      const body = (await response.json()) as { error?: string; tickets?: Ticket[] };
      if (!response.ok) throw new Error(body.error ?? "The desk could not be opened.");
      setTickets(body.tickets ?? []);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The desk could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "reply" | "close", ticket: Ticket) {
    setBusy(true);
    setNote("");
    try {
      const reply = (replies[ticket.id] ?? "").trim();
      const proof = await ownerSign(action, { ticketId: ticket.id, reply });
      const response = await fetch("/api/support/admin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...proof, ticketId: ticket.id, reply }),
      });
      const body = (await response.json()) as { error?: string; ticket?: Ticket };
      if (!response.ok || !body.ticket) throw new Error(body.error ?? "That change was not saved.");
      setTickets((current) => current.map((item) => (item.id === body.ticket?.id ? body.ticket : item)));
      setNote(action === "close" ? "The ticket is closed. It is deleted 30 days after this update." : "The reply is saved. The ticket is deleted 30 days after this update.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "That change was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="admin-support">
      <header className="c2-ph">
        <div className="c2-ph-l">
          <div className="c2-eye">Support desk</div>
          <h1>Notes from wallets</h1>
          <p className="c2-purpose">
            <b>What this is: </b>
            This desk opens only for the support admin wallet.
          </p>
          <p className="c2-purpose">
            <b>What you can do: </b>
            Sign in, write a reply, or close a ticket. A ticket is deleted 30 days after its last update, whether it is still open or already closed. If that wallet is not configured, every sign-in is refused.
          </p>
        </div>
      </header>
      <Btn disabled={busy} onClick={load}>
        Sign in
      </Btn>
      {note ? <p>{note}</p> : null}
      {tickets.map((ticket) => (
        <article key={ticket.id} className="c2-sec" style={{ marginTop: 16 }}>
          <div className="c2-sec-b">
            <h2>{ticket.subject}</h2>
            <p>{ticket.status === "answered" ? "Answered" : ticket.status === "closed" ? "Closed" : "Open"}</p>
            <p>{ticket.message}</p>
            {ticket.reply ? <p>Reply: {ticket.reply}</p> : null}
            {ticket.status === "closed" ? null : (
              <>
                <label>
                  Reply
                  <textarea value={replies[ticket.id] ?? ""} onChange={(event) => setReplies((current) => ({ ...current, [ticket.id]: event.target.value }))} />
                </label>
                <div className="c2-row">
                  <Btn disabled={busy} onClick={() => act("reply", ticket)}>
                    Save reply
                  </Btn>
                  <Btn tone="ghost" disabled={busy} onClick={() => act("close", ticket)}>
                    Close ticket
                  </Btn>
                </div>
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
