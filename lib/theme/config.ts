/**
 * Central UI theme configuration.
 * Edit values here to re-skin the app; `app/globals.css` mirrors these tokens.
 */

export const themeConfig = {
  brand: {
    name: "Agile Turn",
    legalName: "Agile Turn Technology LLP",
    tagline: "Recruitment Suite",
    monogram: "AT",
  },

  fonts: {
    sans: "var(--font-sans)",
    heading: "var(--font-heading)",
    mono: "var(--font-mono)",
    /** Human-readable stack loaded in `app/layout.tsx`. */
    stack: {
      sans: "Geist Sans",
      heading: "Geist Sans",
      mono: "Geist Mono",
    },
  },

  radius: {
    sm: "0.25rem",
    md: "0.375rem",
    lg: "0.5rem",
    xl: "0.625rem",
    default: "0.5rem",
  },

  layout: {
    headerHeight: "3.25rem",
    pagePadding: "1.5rem",
    contentMaxWidth: "90rem",
    sidebarWidth: "16rem",
  },

  motion: {
    pageEnterMs: 600,
    hoverMs: 200,
    staggerMs: 80,
  },

  /** Muted pastel accents for tags, status, and inline highlights. */
  pastels: {
    red: { bg: "#FDEBEC", text: "#9F2F2D" },
    blue: { bg: "#E1F3FE", text: "#1F6C9F" },
    green: { bg: "#EDF3EC", text: "#346538" },
    yellow: { bg: "#FBF3DB", text: "#956400" },
  },

  /** Chart palette — desaturated, editorial tones. */
  charts: [
    "#2F3437",
    "#787774",
    "#9F2F2D",
    "#1F6C9F",
    "#346538",
    "#956400",
  ],

  light: {
    background: "#FBFBFA",
    foreground: "#2F3437",
    card: "#FFFFFF",
    cardForeground: "#2F3437",
    popover: "#FFFFFF",
    popoverForeground: "#2F3437",
    primary: "#111111",
    primaryForeground: "#FFFFFF",
    secondary: "#F7F6F3",
    secondaryForeground: "#2F3437",
    muted: "#F7F6F3",
    mutedForeground: "#787774",
    accent: "#F7F6F3",
    accentForeground: "#2F3437",
    destructive: "#9F2F2D",
    destructiveForeground: "#FFFFFF",
    border: "#EAEAEA",
    input: "#EAEAEA",
    ring: "#111111",
    sidebar: "#FBFBFA",
    sidebarForeground: "#2F3437",
    sidebarPrimary: "#111111",
    sidebarPrimaryForeground: "#FFFFFF",
    sidebarAccent: "#F7F6F3",
    sidebarAccentForeground: "#2F3437",
    sidebarBorder: "#EAEAEA",
    sidebarRing: "#111111",
  },

  dark: {
    background: "#191918",
    foreground: "#E8E6E3",
    card: "#222221",
    cardForeground: "#E8E6E3",
    popover: "#222221",
    popoverForeground: "#E8E6E3",
    primary: "#F7F6F3",
    primaryForeground: "#111111",
    secondary: "#2A2A28",
    secondaryForeground: "#E8E6E3",
    muted: "#2A2A28",
    mutedForeground: "#9B9893",
    accent: "#2A2A28",
    accentForeground: "#E8E6E3",
    destructive: "#C45C5A",
    destructiveForeground: "#FFFFFF",
    border: "rgba(255,255,255,0.08)",
    input: "rgba(255,255,255,0.12)",
    ring: "#E8E6E3",
    sidebar: "#191918",
    sidebarForeground: "#E8E6E3",
    sidebarPrimary: "#F7F6F3",
    sidebarPrimaryForeground: "#111111",
    sidebarAccent: "#2A2A28",
    sidebarAccentForeground: "#E8E6E3",
    sidebarBorder: "rgba(255,255,255,0.08)",
    sidebarRing: "#E8E6E3",
  },
} as const;

export type ThemeMode = "light" | "dark";

export function getChartColor(index: number): string {
  return themeConfig.charts[index % themeConfig.charts.length];
}

export function getPastel(
  key: keyof typeof themeConfig.pastels
): (typeof themeConfig.pastels)[typeof key] {
  return themeConfig.pastels[key];
}
