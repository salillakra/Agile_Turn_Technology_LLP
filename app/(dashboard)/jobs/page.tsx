"use client";

import Jobs from "@/components/pages/Jobs";
import { useJobs } from "@/hooks/queries/useJobs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function JobsPage() {
  const { data: rawJobs, isLoading, isError, error, refetch } = useJobs();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error?.message ?? "Failed to load jobs"}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Jobs
      jobs={rawJobs ?? []}
      setJobs={() => {}}
      applicants={[]}
      refreshJobs={async () => { await refetch(); }}
    />
  );
}
