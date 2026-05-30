"use client";

import { useParams } from "next/navigation";
import JobDetail from "@/components/pages/JobDetail";

export default function JobDetailPage() {
  const params = useParams();
  const jobId = typeof params?.id === "string" ? params.id : "";
  return <JobDetail jobId={jobId} />;
}
