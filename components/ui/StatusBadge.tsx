"use client";

import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  label: string;
  color: string;
  bg: string;
  className?: string;
};

export default function StatusBadge({ label, color, bg, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
        className
      )}
      style={{ color, background: bg }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
