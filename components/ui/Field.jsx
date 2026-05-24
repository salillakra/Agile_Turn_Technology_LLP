"use client";

export default function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <label
        className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
        style={{ fontFamily: "'DM Mono',monospace" }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
