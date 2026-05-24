"use client";

export default function LineSparkline({ values, color = "#34D399", height = 40, width = 120, ...rest }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const denom = values.length > 1 ? values.length - 1 : 1;
  const pts = values.map((v, i) => `${(i / denom) * width},${height - (v / max) * height}`).join(" ");
  return (
    <svg width={width} height={height} {...rest}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" opacity={0.9} />
      <circle cx={width} cy={height - (values[values.length - 1] / max) * height} r={3} fill={color} />
    </svg>
  );
}
