import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
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

export default function LandingLayout({ children }: { children: ReactNode }) {
  return children;
}
