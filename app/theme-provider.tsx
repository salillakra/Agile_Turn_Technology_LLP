"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { themeConfig } from "@/lib/theme";

/**
 * next-themes ThemeProvider — must be a client component.
 * Default theme and storage key are driven by central theme config usage.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="recruitment-ui-theme"
      themes={["light", "dark"]}
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  );
}

export { themeConfig };
