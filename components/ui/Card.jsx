"use client";

export default function Card({ children, style: sx = {}, glow, glass, className = "", ...rest }) {
  const base = glass
    ? `rounded-[14px] glass-panel border-[var(--glass-border)] transition-[box-shadow,transform] duration-300 ease-out transform-gpu hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(59,130,246,0.12),var(--glass-shadow)] dark:hover:shadow-[0_14px_48px_rgba(0,0,0,0.45)] active:scale-[0.995] ${glow ? "shadow-[0_0_40px_var(--accent-glow)]" : ""}`
    : `rounded-[14px] border border-(--app-border) bg-(--app-card) transition-colors duration-200 transform-gpu hover:-translate-y-1 active:scale-[0.99] ${
        glow
          ? "shadow-[0_0_30px_var(--accent-glow)]"
          : "shadow-[0_2px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)]"
      }`;

  return (
    <div {...rest} className={`${base} ${className}`.trim()} style={sx}>
      {children}
    </div>
  );
}
