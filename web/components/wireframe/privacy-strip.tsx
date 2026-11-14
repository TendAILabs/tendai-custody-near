import { Lock, Server, ShieldCheck, Smartphone } from "lucide-react";
import { CIPHERTEXT_SAMPLE, MODEL_ID, SECTION_BODY } from "@/lib/fixtures";
import { Card } from "./ui";

const STEPS = [
  { icon: Smartphone, title: "This device", body: "In this demo the encryption keys are seeded on the server." },
  { icon: Lock, title: "E2EE", body: "The summary request is encrypted to the attested model key." },
  { icon: ShieldCheck, title: "Attested model", body: `${MODEL_ID} in a NEAR AI Cloud TEE.` },
  { icon: Server, title: "NEAR testnet", body: "Hashes, scope, expiry, and custody events only." },
];

export function PrivacyStrip() {
  return (
    <div data-testid="privacy-strip">
      <h3 className="mb-2 text-sm font-semibold">What left the device</h3>
      <ol className="grid gap-2 md:grid-cols-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-3">
              <div className="flex items-center gap-2 text-[var(--teal)]">
                <Icon size={16} aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  {index + 1}. {step.title}
                </span>
              </div>
              <p className="mt-2 text-sm leading-5">{step.body}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CipherContrast() {
  return (
    <div data-testid="cipher-contrast" className="grid gap-3 md:grid-cols-2">
      <Card title="Plaintext, on the device">
        <p className="text-sm leading-6">{SECTION_BODY.history}</p>
      </Card>
      <Card title="Ciphertext the relay would store">
        <p className="font-mono text-xs leading-5 break-all text-[var(--muted)]">{CIPHERTEXT_SAMPLE}</p>
      </Card>
    </div>
  );
}
