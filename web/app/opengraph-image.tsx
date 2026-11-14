import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "TendAI Custody. Patient-approved clinic-to-hospital record sharing on NEAR.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const [sans, mono] = await Promise.all([
  readFile(join(process.cwd(), "lib/og/fonts/IBMPlexSans-SemiBold.ttf")),
  readFile(join(process.cwd(), "lib/og/fonts/IBMPlexMono-Medium.ttf")),
]);

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F4F6F8",
          color: "#0F172A",
          fontFamily: "Plex Sans",
        }}
      >
        <div style={{ width: 18, height: "100%", background: "#1A2744" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "64px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 12,
                background: "#0D9488",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Plex Mono",
                fontSize: 22,
              }}
            >
              TC
            </div>
            <div
              style={{
                display: "flex",
                marginLeft: 18,
                fontFamily: "Plex Mono",
                fontSize: 20,
                letterSpacing: 2,
                color: "#475569",
              }}
            >
              NEAR TESTNET
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 76, letterSpacing: -2, lineHeight: 1 }}>TendAI Custody</div>
            <div style={{ width: 84, height: 8, background: "#00C08B", marginTop: 22, borderRadius: 4 }} />
            <div style={{ marginTop: 28, fontSize: 32, lineHeight: 1.35, color: "#1A2744", maxWidth: 920 }}>
              Patient-approved clinic-to-hospital record sharing, with a chain-of-custody log on NEAR and a NEAR AI TEE summary.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div
              style={{
                display: "flex",
                background: "#00C08B",
                color: "#0F172A",
                borderRadius: 999,
                padding: "12px 20px",
                fontSize: 22,
              }}
            >
              Designed around HIPAA principles
            </div>
            <div style={{ display: "flex", fontFamily: "Plex Mono", fontSize: 20, color: "#475569" }}>tendaicustody.app</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Plex Sans", data: sans, weight: 600, style: "normal" },
        { name: "Plex Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
