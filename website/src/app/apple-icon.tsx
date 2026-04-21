import { ImageResponse } from "next/og";

// Apple touch icon, served at /apple-icon.png. Used by iOS home-screen
// pinning, macOS Touch Bar, and a handful of other surfaces that do
// not read SVG favicons. Renders the teamfuse lightning bolt on a dark
// slate square, matching agents-web/src/app/icon.svg and docs/logo.svg.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(180deg, #1e293b 0%, #020617 100%)",
          borderRadius: 36,
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fde047" />
              <stop offset="1" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <polygon
            points="17.5,3 4.5,19 15.5,19 14.5,29 27.5,13 16.5,13 17.5,3"
            fill="url(#b)"
            stroke="#78350f"
            strokeWidth="0.6"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
