"use client";
import { inputBase } from "@/lib/helpers";

export default function Sel({ value, onChange, options, style: sx, ...rest }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, cursor: "pointer", ...sx }}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  );
}
