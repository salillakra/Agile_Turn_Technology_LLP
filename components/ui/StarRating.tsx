"use client";

export default function StarRating({ value, onChange }: { value: number; onChange?: (val: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span
          key={s}
          onClick={() => onChange?.(s)}
          style={{ fontSize: 16, cursor: onChange ? "pointer" : "default", color: s <= value ? "#FBBF24" : "var(--muted-foreground)", opacity: s <= value ? 1 : 0.25, transition: "color .1s" }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
