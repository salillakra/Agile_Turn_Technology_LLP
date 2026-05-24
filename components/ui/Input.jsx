"use client";
import { useState } from "react";
import { inputBase, C } from "@/lib/helpers";

export default function Input({ style: sx, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        ...inputBase,
        borderColor: focused ? C.accent : "var(--input-border)",
        ...sx,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}
