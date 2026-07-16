"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Sun/moon toggle for light ↔ dark.
 * Renders after mount to avoid hydration mismatch with next-themes.
 */
export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && (resolvedTheme ?? theme) === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      suppressHydrationWarning
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"}
    >
      {!mounted ? (
        <Sun className="opacity-0" />
      ) : isDark ? (
        <Sun />
      ) : (
        <Moon />
      )}
    </Button>
  );
}
