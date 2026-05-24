"use client";

export default function Badge({ label, color, bg }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99,
        fontSize: 11, fontWeight: 700, color, background: bg, letterSpacing: ".04em", fontFamily: "'DM Mono',monospace",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
