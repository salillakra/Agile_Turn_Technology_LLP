"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import JobRecommendedCandidates from "@/components/JobRecommendedCandidates";
import JobCandidateScores from "@/components/JobCandidateScores";
import InterviewTimeline from "@/components/InterviewTimeline";
import { ArrowLeft, Buildings, MapPin, Briefcase, Users, UserCheck } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

function apiJobToUi(j: any) {
  const m = j && typeof j.jobMeta === "object" && j.jobMeta != null ? j.jobMeta : {};
  const salaryMin = typeof m.salaryMin === "number" ? m.salaryMin : null;
  const salaryMax = typeof m.salaryMax === "number" ? m.salaryMax : null;
  const currency = typeof m.currency === "string" ? m.currency : "";
  const salary =
    salaryMin != null || salaryMax != null
      ? `${currency ? `${currency} ` : ""}${salaryMin ?? "?"}${salaryMax != null ? ` - ${salaryMax}` : ""}`
      : "";
  const st = j.status === "OPEN" ? "Open" : j.status === "PAUSED" ? "Paused" : "Closed";
  return {
    id: j.id,
    title: j.title,
    dept: j.department,
    loc: j.location,
    employmentType: typeof m.employmentType === "string" ? m.employmentType : "",
    salary,
    status: st,
    statusApi: j.status,
    applicantCount: j.applicantCount ?? 0,
    hiredCount: j.hiredCount ?? 0,
    jobMeta: m,
    description: j.description,
    yearsOfExperience: j.yearsOfExperience,
    requiredSkills: Array.isArray(j.requiredSkills) ? j.requiredSkills : [],
  };
}

interface JobDetailProps {
  jobId: string;
}

export default function JobDetail({ jobId }: JobDetailProps) {
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recRefreshKey, setRecRefreshKey] = useState(0);

  const loadJob = useCallback(async () => {
    if (!jobId) {
      setError("Missing job id");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Failed to load job (${res.status})`);
      }
      setJob(apiJobToUi(body));
    } catch (e) {
      setJob(null);
      setError(e instanceof Error ? e.message : "Failed to load job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void loadJob();
  }, [loadJob]);

  if (loading) {
    return <div className="text-sm font-mono text-muted-foreground py-10 text-center">Loading position details...</div>;
  }

  if (error || !job) {
    return (
      <div className="space-y-4">
        <Link href="/jobs" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 gap-2")}>
          <ArrowLeft className="size-3.5" />
          Back to positions
        </Link>
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error || "Job position not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const requiredSkills =
    job.requiredSkills?.length > 0
      ? job.requiredSkills
      : Array.isArray(job.jobMeta?.requiredSkills)
      ? job.jobMeta.requiredSkills
      : [];

  return (
    <div className="flex flex-col gap-6">
      {/* Back button */}
      <div>
        <Link href="/jobs" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-8 -ml-2 mb-2 text-muted-foreground hover:text-foreground gap-1.5")}>
          <ArrowLeft className="size-3.5" />
          Back to positions
        </Link>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">Job Detail</p>
        <h1 className="text-2xl font-bold tracking-tight">{job.title}</h1>
      </div>

      {/* Main position info card */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={job.status === "Open" ? "default" : job.status === "Paused" ? "secondary" : "destructive"}>
              {job.status}
            </Badge>

            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Buildings className="size-3.5" />
                {job.dept}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {job.loc}
              </span>
              {job.employmentType && (
                <span className="flex items-center gap-1">
                  <Briefcase className="size-3.5" />
                  {job.employmentType}
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-6 border-y py-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary/80" />
              <div>
                <p className="text-lg font-bold tabular-nums leading-none">{job.applicantCount}</p>
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mt-0.5">Applicants</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <UserCheck className="size-5 text-emerald-600" />
              <div>
                <p className="text-lg font-bold tabular-nums leading-none text-emerald-600">{job.hiredCount}</p>
                <p className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mt-0.5">Hired</p>
              </div>
            </div>
          </div>

          {job.description && (
            <p className="text-sm text-foreground/80 leading-relaxed max-w-3xl">{job.description}</p>
          )}

          {requiredSkills.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Required Skills</span>
              <div className="flex flex-wrap gap-1.5">
                {requiredSkills.map((skill: string) => (
                  <Badge key={skill} variant="secondary" className="text-[10px] font-medium py-0 px-2 h-5">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-2 flex-wrap border-t">
            <Link href={`/applicants?jobId=${encodeURIComponent(job.id)}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs font-semibold")}>
              View Applicants
            </Link>
            <Link href={`/kanban`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs font-semibold")}>
              Open Pipeline
            </Link>
            <Link href={`/apply/${job.id}`} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 text-xs font-semibold")}>
              Apply Link
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations Panel */}
      <Card>
        <CardContent className="p-6">
          <JobRecommendedCandidates
            jobId={job.id}
            jobStatus={job.status}
            enabled
            refreshKey={recRefreshKey}
            onPipelineChange={() => {
              setRecRefreshKey((k) => k + 1);
              void loadJob();
            }}
          />
        </CardContent>
      </Card>

      {/* Interview Timeline Panel */}
      <Card>
        <CardContent className="p-6">
          <InterviewTimeline jobId={job.id} enabled showCandidate />
        </CardContent>
      </Card>

      {/* Candidate Scores Panel */}
      <Card>
        <CardContent className="p-6">
          <JobCandidateScores
            jobId={job.id}
            jobStatus={job.status}
            enabled
            refreshKey={recRefreshKey}
            onPipelineChange={() => {
              setRecRefreshKey((k) => k + 1);
              void loadJob();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
