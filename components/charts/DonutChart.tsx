"use client";

export default function DonutChart({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let cum = 0;
  const r = 44, cx = size / 2, cy = size / 2;
  const slices = data.map((d) => {
    const pct = d.value / total;
    const start = cum;
    cum += pct;
    return { ...d, pct, start };
  });
  const arc = (start, end, radius) => {
    const s = { x: cx + radius * Math.cos(2 * Math.PI * start - Math.PI / 2), y: cy + radius * Math.sin(2 * Math.PI * start - Math.PI / 2) };
    const e = { x: cx + radius * Math.cos(2 * Math.PI * end - Math.PI / 2), y: cy + radius * Math.sin(2 * Math.PI * end - Math.PI / 2) };
    const large = end - start > 0.5 ? 1 : 0;
    return `M${s.x},${s.y} A${radius},${radius} 0 ${large},1 ${e.x},${e.y}`;
  };
  return (
    <svg width={size} height={size}>
      {slices.map((s, i) => s.pct > 0 && <path key={i} d={arc(s.start, s.start + s.pct, r)} fill="none" stroke={s.color} strokeWidth={14} />)}
      <circle cx={cx} cy={cy} r={30} fill="var(--donut-center-bg)" />
      <text x={cx} y={cy + 4} textAnchor="middle" fill="var(--text-heading)" fontSize={13} fontWeight="600" fontFamily="var(--font-mono)">{total}</text>
    </svg>
  );
}
