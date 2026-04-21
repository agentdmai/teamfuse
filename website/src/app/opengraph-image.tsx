import { ImageResponse } from "next/og";

export const alt = "teamfuse, fuse Claude Code agents into a working team";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background:
            "linear-gradient(180deg, #1e293b 0%, #020617 100%)",
          color: "#f1f5f9",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="120" height="120" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fde047" />
                <stop offset="1" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <polygon
              points="17.5,3 4.5,19 15.5,19 14.5,29 27.5,13 16.5,13 17.5,3"
              fill="url(#b)"
            />
          </svg>
          <div
            style={{
              fontSize: 160,
              fontWeight: 800,
              letterSpacing: -6,
              lineHeight: 1,
            }}
          >
            teamfuse
          </div>
        </div>
        <div
          style={{
            marginTop: 48,
            fontSize: 36,
            color: "#cbd5e1",
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          Fuse Claude Code agents into a working team.
        </div>
        <div
          style={{
            marginTop: "auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 24,
            color: "#fbbf24",
            letterSpacing: 3,
            textTransform: "uppercase",
          }}
        >
          <div>teamfuse.dev</div>
          <div>github.com/agentdmai/teamfuse</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
