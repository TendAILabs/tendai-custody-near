"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Hospital, Lock, Smartphone } from "lucide-react";
import { useStory } from "@/lib/story-context";
import { Button, Card } from "./ui";

const STEPS = [
  { n: "1", title: "Clinic encrypts", body: "Dr. Park sends a referral from this device. NEAR stores hashes, not the chart." },
  { n: "2", title: "Maya approves", body: "She narrows the sections, sets an expiry, and checks the TEE summary." },
  { n: "3", title: "Hospital opens", body: "St. Aster can read it only after an on-chain ticket. Revoke blocks the next open." },
];

export function LandingScreen() {
  const { seedMaya, startDemo } = useStory();
  const router = useRouter();

  return (
    <div className="c2-idle space-y-8 max-[480px]:space-y-5">
      <section className="c2-idle-hero overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-6 md:p-10 max-[480px]:rounded-[2px] max-[480px]:p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--teal)]">NEAR HACKATHON</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl max-[480px]:mt-2 max-[480px]:text-[28px] max-[480px]:leading-[1.15]">
          When a doctor refers you, your records get faxed to the next clinic and nobody asks you.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)] max-[480px]:mt-2 max-[480px]:text-sm max-[480px]:leading-5">
          Your records move only when you approve, only the part the specialist needs, summarized inside a verified
          private AI enclave, with every hand-off logged on NEAR.
        </p>
        <div className="relative mt-8 h-28 rounded-[8px] bg-[var(--bg)] max-[480px]:mt-3 max-[480px]:h-20 max-[480px]:rounded-[2px]">
          <div className="absolute inset-x-8 top-1/2 h-px bg-[var(--line)]" />
          <span className="relay-dot absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-[var(--sand)] shadow" />
          <div className="absolute inset-0 flex items-center justify-between px-4 md:px-10">
            {[
              { icon: Building2, label: "Clinic" },
              { icon: Smartphone, label: "Maya" },
              { icon: Hospital, label: "Hospital" },
            ].map((node) => {
              const Icon = node.icon;
              return (
                <div key={node.label} className="relative z-10 flex flex-col items-center gap-1 rounded-[8px] bg-[var(--card)] px-3 py-2 text-xs font-semibold shadow">
                  <Icon size={18} className="text-[var(--teal)]" aria-hidden="true" />
                  <Lock size={12} className="text-[var(--sand)]" aria-hidden="true" />
                  {node.label}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3 max-[480px]:mt-3">
          <Button
            tone="solid"
            testId="you-are-maya"
            onClick={() => {
              seedMaya();
              router.push("/patient/consent");
            }}
          >
            You are Maya
          </Button>
          <Button
            testId="guided-demo"
            onClick={() => {
              startDemo();
              router.push("/demo");
            }}
          >
            Guided demo
          </Button>
          <Link
            href="/home"
            data-testid="open-the-app"
            className="inline-flex items-center rounded-full px-4 py-2 text-sm font-semibold text-[var(--teal)] max-[480px]:rounded-[4px] max-[480px]:px-3"
          >
            Open the app
          </Link>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n}>
              <Card>
                <p className="text-xs font-semibold text-[var(--teal)]">Step {step.n}</p>
                <p className="mt-1 font-semibold">{step.title}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
