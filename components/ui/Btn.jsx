"use client";

export default function Btn({ children, onClick, variant = "primary", sm, style: sx = {}, disabled }) {
  const variantStyles = {
    primary: { background: "#3B82F6", color: "#fff" },
    ghost: {
      background: "rgba(148, 163, 184, 0.12)",
      color: "var(--text-body)",
      border: "1px solid var(--app-border)",
    },
    danger: { background: "rgba(248,113,113,.12)", color: "#F87171", border: "1px solid rgba(248,113,113,.2)" },
    success: { background: "rgba(52,211,153,.12)", color: "#34D399", border: "1px solid rgba(52,211,153,.2)" },
  };
  const base = variantStyles[variant] || variantStyles.primary;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="transform-gpu active:scale-[0.97] active:transition-transform"
      style={{
        ...base,
        border: base.border ?? "none",
        borderRadius: 8,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "'DM Sans',sans-serif",
        fontWeight: 600,
        fontSize: sm ? 12 : 13,
        padding: sm ? "5px 11px" : "8px 16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        opacity: disabled ? 0.5 : 1,
        transition: "all .15s, background-color .2s ease",
        ...sx,
      }}
    >
      {children}
    </button>
  );
}
