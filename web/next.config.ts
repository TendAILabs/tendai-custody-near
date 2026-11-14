import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/http/csp";
import { CROSS_ORIGIN_OPENER_POLICY, permissionsPolicy } from "./lib/http/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/demo", destination: "/home?guide=1", permanent: false },
      { source: "/landing", destination: "/", permanent: false },
      { source: "/patient/consent", destination: "/patient", permanent: false },
      { source: "/patient/history", destination: "/patient/timeline", permanent: false },
      { source: "/patient/verified", destination: "/verification", permanent: false },
    ];
  },
  logging: { incomingRequests: false },
  async headers() {
    const csp = contentSecurityPolicy(process.env.VERCEL_ENV);
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: permissionsPolicy() },
          { key: "Cross-Origin-Opener-Policy", value: CROSS_ORIGIN_OPENER_POLICY },
        ],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
};

export default nextConfig;
