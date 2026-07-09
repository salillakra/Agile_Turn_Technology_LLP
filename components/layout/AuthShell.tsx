import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import { themeConfig } from "@/lib/theme";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  children: React.ReactNode;
  className?: string;
};

export default function AuthShell({ children, className }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0.03),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.04),transparent_55%)]" />

      <header className="flex items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <div className="flex h-9 items-center justify-center">
            <img src="/agile_turn_logo.png" alt="Agile Turn Logo" className="h-full w-auto object-contain dark:invert" />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold tracking-[-0.02em] text-foreground">{themeConfig.brand.name}</p>
            <p className="text-eyebrow normal-case">{themeConfig.brand.tagline}</p>
          </div>
        </Link>
        <ThemeToggle />
      </header>

      <main
        className={cn(
          "flex flex-1 items-center justify-center px-6 pb-12",
          className
        )}
      >
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
