export const uid = () => Math.random().toString(36).slice(2, 9);

export const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

export const pick = (arr) => arr[rnd(0, arr.length - 1)];

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const daysBetween = (a, b) =>
  Math.round(Math.abs(new Date(b) - new Date(a)) / 86400000);

/** Typography tokens — use CSS variables from globals.css (light/dark). */
export const T = {
  h1: {
    fontFamily: "var(--font-heading)",
    fontSize: 26,
    fontWeight: 600,
    color: "var(--text-heading)",
    margin: 0,
    letterSpacing: "-0.03em",
  },
  h2: {
    fontFamily: "var(--font-heading)",
    fontSize: 18,
    fontWeight: 600,
    color: "var(--text-heading)",
    margin: 0,
    letterSpacing: "-0.03em",
  },
  h3: {
    fontFamily: "var(--font-heading)",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-heading-soft)",
    margin: 0,
    letterSpacing: "-0.02em",
  },
  body: {
    fontFamily: "var(--font-sans)",
    fontSize: 13,
    color: "var(--text-body)",
  },
  mono: {
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    color: "var(--text-mono)",
  },
};

/** Surface / chrome tokens — theme-aware via CSS variables. */
export const C = {
  bg: "var(--app-bg)",
  surface: "var(--app-surface)",
  card: "var(--app-card)",
  border: "var(--app-border)",
  borderHover: "var(--app-border-strong)",
  accent: "var(--accent)",
  accentGlow: "var(--accent-glow)",
};

export const inputBase = {
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  color: "var(--text-heading-soft)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  padding: "8px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  transition: "border-color .15s, background-color .2s ease",
};
