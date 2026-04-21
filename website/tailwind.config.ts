import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        panel: {
          900: "#020617",
          800: "#0f172a",
          700: "#1e293b",
          600: "#334155",
        },
        bolt: {
          500: "#f59e0b",
          400: "#fbbf24",
          300: "#fcd34d",
          200: "#fde047",
        },
      },
      backgroundImage: {
        "bezel-gradient":
          "linear-gradient(180deg, #cbd5e1 0%, #64748b 100%)",
        "panel-gradient":
          "linear-gradient(180deg, #1e293b 0%, #020617 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
