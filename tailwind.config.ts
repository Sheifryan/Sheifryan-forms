import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A", // slate-900
        paper: "#F8FAFC", // slate-50
        panel: "#FFFFFF",
        line: "#E2E8F0", // slate-200
        muted: "#94A3B8", // slate-400
        signal: "#6D28D9", // violet-700 — primary accent (Royal Plum)
        signalSoft: "#B69CFB", // soft lavender-violet tint
        accent2: "#C026D3", // fuchsia-600 — secondary accent (gradients, avatars)
        success: "#059669", // emerald-600
        warn: "#E11D48", // rose-600
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
