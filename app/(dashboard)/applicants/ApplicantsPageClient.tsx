"use client";

import { Suspense } from "react";
import Applicants from "@/components/pages/Applicants";
import { mapApplicationsApiRowToApplicantItem } from "@/src/lib/applications-drilldown-ui";
import { useJobs } from "@/hooks/queries/useJobs";
import { useApplications } from "@/hooks/queries/useApplicants";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQueryClient } from "@tanstack/react-query";
import { applicantKeys } from "@/hooks/queries/useApplicants";
import { invalidateSidebarNav } from "@/hooks/queries/useSidebarNav";

function ApplicantsPageClient() {
  const queryClient = useQueryClient();

  const jobsQuery = useJobs();
  const appsQuery = useApplications({ limit: 100 });

  const isLoading = jobsQuery.isLoading || appsQuery.isLoading;
  const isError = jobsQuery.isError || appsQuery.isError;
  const errorMsg = jobsQuery.error?.message || appsQuery.error?.message;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMsg ?? "Failed to load applicants"}</AlertDescription>
      </Alert>
    );
  }

  const jobs = jobsQuery.data ?? [];
  const rawApps = Array.isArray(appsQuery.data?.data) ? appsQuery.data.data : [];
  const applicants = rawApps.map((r: any) => mapApplicationsApiRowToApplicantItem(r));

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: applicantKeys.all }),
      invalidateSidebarNav(queryClient),
    ]);
  };

  return (
    <Applicants
      applicants={applicants}
      setApplicants={() => {}}
      jobs={jobs}
      onRefresh={handleRefresh}
    />
  );
}

export default function ApplicantsPageWrapper() {
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
      <ApplicantsPageClient />
    </Suspense>
  );
}
