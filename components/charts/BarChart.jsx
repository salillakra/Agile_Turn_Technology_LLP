"use client";

export default function BarChart({ data, valueKey, labelKey, color = "#60A5FA", height = 120 }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <svg width="100%" height={height} style={{ overflow: "visible" }}>
      {data.map((d, i) => {
        const bh = Math.max(2, (d[valueKey] / max) * (height - 28));
        const bw = `${90 / data.length}%`;
        const x = `${(i / data.length) * 100 + 5 / data.length}%`;
        return (
          <g key={i}>
            <rect x={x} y={height - 20 - bh} width={bw} height={bh} fill={color} rx={3} opacity={0.85} />
            <text x={`${(i / data.length) * 100 + 45 / data.length}%`} y={height - 4} textAnchor="middle" fill="var(--text-muted)" fontSize={9} fontFamily="'DM Mono',monospace">{d[labelKey]?.toString().slice(0, 6)}</text>
            <text x={`${(i / data.length) * 100 + 45 / data.length}%`} y={height - bh - 24} textAnchor="middle" fill={color} fontSize={10} fontFamily="'DM Mono',monospace" fontWeight="700">{d[valueKey]}</text>
          </g>
        );
      })}
    </svg>
  );
}
