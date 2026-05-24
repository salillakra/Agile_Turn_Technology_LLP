"use client";
import Badge from "./Badge";
import { STAGE_META } from "@/data/mockData";

export default function StageBadge({ stage }) {
  const meta = STAGE_META[stage] || { color: "var(--text-body)", bg: "rgba(148,163,184,.12)" };
  return <Badge label={stage} color={meta.color} bg={meta.bg} />;
}
