"use client";
import { useState } from "react";
import { inputBase, C } from "@/lib/helpers";

export default function Textarea({ style: sx, rows = 3, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      rows={rows}
      style={{
        ...inputBase,
        borderColor: focused ? C.accent : "var(--input-border)",
        resize: "vertical",
        ...sx,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}
