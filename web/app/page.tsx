import type { Metadata, Viewport } from "next";
import { LandingView } from "@/components/landing/landing-view";
import { plexMono, plexSans, sourceSerif } from "@/components/landing/fonts";
import { SITE_DESCRIPTION } from "@/lib/site/social";
import "@/components/landing/landing.css";

export const metadata: Metadata = {
  title: {
    absolute: "TendAI Custody | Patient-approved record transfers on NEAR",
  },
  description: SITE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: "#F4F6F8",
  width: "device-width",
  initialScale: 1,
};

export default function Page() {
  return <LandingView fontClass={`${sourceSerif.variable} ${plexSans.variable} ${plexMono.variable}`} />;
}
