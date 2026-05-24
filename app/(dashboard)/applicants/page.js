import { Suspense } from "react";
import { requireAuth } from "@/src/lib/auth";
import ApplicantsPageClient from "./ApplicantsPageClient";

export default async function ApplicantsPage() {
  await requireAuth();
  return (
    <Suspense fallback={<p style={{ color: "#64748B", padding: 8 }}>Loading…</p>}>
      <ApplicantsPageClient />
    </Suspense>
  );
}
