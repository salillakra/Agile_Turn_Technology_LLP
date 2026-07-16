"use client";

import StatusBadge from "@/components/ui/StatusBadge";
import { STAGE_META } from "@/data/mockData";

export default function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] || { color: "var(--text-body)", bg: "rgba(148,163,184,.12)" };
  return <StatusBadge label={stage} color={meta.color} bg={meta.bg} />;
}
