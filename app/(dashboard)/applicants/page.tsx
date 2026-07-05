import { Suspense } from "react";
import { requireAuth } from "@/src/lib/auth";
import ApplicantsPageWrapper from "./ApplicantsPageClient";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ApplicantsPage() {
  await requireAuth();
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      }
    >
      <ApplicantsPageWrapper />
    </Suspense>
  );
}
