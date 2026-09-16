import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "LLM Personality Board — HEXACO personality profiles for AI models";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Reused as the twitter:image too (Next.js falls back to opengraph-image
// when no twitter-image file is present). Plain hex approximations of the
// oklch palette used elsewhere — Satori (the renderer behind ImageResponse)
// doesn't support the oklch() color function.
const DOTS = [
  { hue: "#3aa88a", label: "GPT" },
  { hue: "#d17a45", label: "CL" },
  { hue: "#5b8fd9", label: "GM" },
  { hue: "#c15fa0", label: "GR" },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f5f2",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", gap: 20, marginBottom: 44 }}>
          {DOTS.map((d) => (
            <div
              key={d.label}
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                background: d.hue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: 26,
                fontWeight: 700,
              }}
            >
              {d.label}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, color: "#2c2620", letterSpacing: -1 }}>
          LLM Personality Board
        </div>
        <div style={{ fontSize: 28, color: "#6b6258", marginTop: 18 }}>
          HEXACO personality profiles for AI models
        </div>
      </div>
    ),
    { ...size }
  );
}
