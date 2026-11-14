import type { Metadata } from "next";
import { AskLaunch } from "@/components/assist/ask-launch";
import { DocsView } from "@/components/docs/docs-view";
import { plexMono, plexSans } from "@/components/landing/fonts";
import { DOC_DESCRIPTION, DOC_TITLE } from "@/content/docs";
import "@/components/docs/docs.css";

export const metadata: Metadata = {
  title: { absolute: DOC_TITLE },
  description: DOC_DESCRIPTION,
  openGraph: {
    title: DOC_TITLE,
    description: DOC_DESCRIPTION,
    type: "article",
    url: "./",
    siteName: "TendAI Custody",
  },
  twitter: {
    card: "summary_large_image",
    title: DOC_TITLE,
    description: DOC_DESCRIPTION,
  },
};

export default function DocsPage() {
  return (
    <div className={`${plexSans.variable} ${plexMono.variable}`}>
      <DocsView tools={<AskLaunch />} />
    </div>
  );
}
