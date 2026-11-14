import type { Metadata } from "next";

export const SITE_ORIGIN = "https://tendaicustody.app";
export const SITE_NAME = "TendAI Custody";
export const SITE_DESCRIPTION =
  "Patient-approved clinic-to-hospital record sharing with a chain-of-custody log on NEAR and a NEAR AI TEE summary. Prototype with fictional example data. Designed around HIPAA principles.";

export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: SITE_NAME,
    template: "%s | TendAI Custody",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    // A URL object is resolved with the current path, so each public page
    // canonicalizes on this host. The app still answers on its Vercel host.
    canonical: new URL(SITE_ORIGIN),
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: "./",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};
