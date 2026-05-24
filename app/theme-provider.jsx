"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * next-themes ThemeProvider — must be a client component.
 * - attribute="class" → toggles `dark` on <html> for Tailwind `dark:` variants.
 * - defaultTheme="dark" → first visit uses dark until the user switches.
 * - storageKey → localStorage key for persistence ("recruitment-ui-theme").
 * - enableSystem={false} → only light/dark (no OS theme).
 */
export function ThemeProvider({ children }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="recruitment-ui-theme"
      themes={["light", "dark"]}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}
