import { Inter } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { AskProvider } from "@/components/assist/ask-context";
import { AskTendAi } from "@/components/assist/ask-tendai";
import { Shell } from "@/components/wireframe/shell";
import { siteMetadata } from "@/lib/site/social";
import { StoryProvider } from "@/lib/story-context";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = siteMetadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <AskProvider>
          <StoryProvider>
            {/*
              Dynamic segments such as /patient/records/[id] do not know the
              pathname during prerender, so Shell's usePathname suspends.
              Static routes do not suspend here. Page copy is rendered by Shell.
            */}
            <Suspense fallback={null}>
              <Shell>{children}</Shell>
            </Suspense>
          </StoryProvider>
          <AskTendAi />
        </AskProvider>
      </body>
    </html>
  );
}
