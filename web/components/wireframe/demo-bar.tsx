"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DEMO_STEPS, isDemoStepDone } from "@/lib/demo-steps";
import { useStory } from "@/lib/story-context";
import { Button, Pill } from "./ui";

export function DemoBar() {
  const { state, setDemoStep } = useStory();
  const pathname = usePathname();
  const router = useRouter();
  if (!state.demoActive || pathname === "/demo") return null;

  const step = DEMO_STEPS[state.demoStep];
  const done = isDemoStepDone(state.demoStep, state);

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--wait-bg)] px-3 py-2 text-sm md:px-6">
      <Pill tone="wired">Guided demo</Pill>
      <p className="font-medium">
        Step {state.demoStep + 1} of 7. {step?.label}
      </p>
      <Link href="/demo" className="text-[var(--teal)] underline">
        Back to guided demo
      </Link>
      {done && state.demoStep < DEMO_STEPS.length - 1 ? (
        <Button
          tone="solid"
          onClick={() => {
            setDemoStep(state.demoStep + 1);
            router.push("/demo");
          }}
        >
          Continue
        </Button>
      ) : null}
    </div>
  );
}
