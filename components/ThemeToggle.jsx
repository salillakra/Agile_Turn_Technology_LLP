"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Sun/moon toggle for light ↔ dark. Renders after mount to avoid hydration mismatch
 * (theme is read from localStorage / system by next-themes).
 */
export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** Only treat as dark after mount so SSR + first client paint match (next-themes reads storage after hydration). */
  const isDark = mounted && (resolvedTheme ?? theme) === "dark";

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() =>
        setTheme((resolvedTheme ?? theme) === "dark" ? "light" : "dark")
      }
      aria-label={
        mounted
          ? isDark
            ? "Switch to light theme"
            : "Switch to dark theme"
          : "Toggle theme"
      }
      title={mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-slate-300/90 bg-white text-lg text-slate-800 transition-all duration-200 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08]"
    >
      {!mounted ? (
        <span className="opacity-0">☀</span>
      ) : isDark ? (
        <span aria-hidden>☀️</span>
      ) : (
        <span aria-hidden>🌙</span>
      )}
    </button>
  );
}
