"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import apiClient from "@/lib/axios";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import ResumeCandidateModal from "@/components/ResumeCandidateModal";
import { canCreateCandidate, canReadResume, canViewCandidates } from "@/src/lib/rbac";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import { dispatchPipelineDataRefresh } from "@/src/lib/applicants-refresh-event";
import RecruiterSearchQueryInput from "@/components/RecruiterSearchQueryInput";
import { RECRUITER_SEARCH_SUGGESTIONS } from "@/src/lib/ai/recruiter-search-suggestions";
import { trackRecruiterSearchClick } from "@/lib/recruiter-search-analytics-client";
import { MagnifyingGlass, Check, ArrowsClockwise, FileText, Plus, UserPlus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const FEATURED_SUGGESTIONS = RECRUITER_SEARCH_SUGGESTIONS.slice(0, 6).map((s) => s.text);

function formatScore(value: any) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function displayReason(raw: any) {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "Semantic match — review profile for fit.";
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim();
  return (first || text).replace(/\.$/, "");
}

function formatBatchSummary(body: any) {
  const created = typeof body?.created === "number" ? body.created : 0;
  const skippedDuplicates = typeof body?.skippedDuplicates === "number" ? body.skippedDuplicates : 0;
  const parts = [];
  if (created > 0) parts.push(created === 1 ? "1 added to pipeline" : `${created} added to pipeline`);
  if (skippedDuplicates > 0) parts.push(skippedDuplicates === 1 ? "1 already on pipeline" : `${skippedDuplicates} already on pipeline`);
  return parts.length ? parts.join(" · ") + "." : "No changes.";
}

export default function RecruiterAiSearch() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canView = canViewCandidates(role);
  const canApply = canCreateCandidate(role);
  const canViewResume = canReadResume(role);

  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [searchId, setSearchId] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobPicker, setJobPicker] = useState<{ open: boolean; candidateIds: string[]; mode: string }>({
    open: false,
    candidateIds: [],
    mode: "pipeline",
  });
  const [selectedJobId, setSelectedJobId] = useState("");
  const [pipelineBusy, setPipelineBusy] = useState(false);

  const [sessionShortlist, setSessionShortlist] = useState<Set<string>>(() => new Set());
  const [busyCandidateId, setBusyCandidateId] = useState("");

  const [resumeModal, setResumeModal] = useState<{ open: boolean; candidateId: string | undefined; name: string }>({
    open: false,
    candidateId: undefined,
    name: "",
  });

  const openJobs = useMemo(
    () => jobs.filter((j) => j.status === "OPEN" || j.status === "Open"),
    [jobs]
  );

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const { data: body } = await apiClient.get("/jobs?limit=100&status=OPEN");
      const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      setJobs(
        rows
          .filter((j: any) => j && typeof j.id === "string")
          .map((j: any) => ({
            id: j.id,
            title: j.title ?? "Untitled job",
            status: j.status === "OPEN" ? "Open" : j.status === "PAUSED" ? "Paused" : j.status ?? "Open",
          }))
      );
    } catch {
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canApply) void loadJobs();
  }, [canApply, loadJobs]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const { data: body } = await apiClient.get("/search/analytics?days=30");
      if (body && typeof body === "object") setAnalytics(body);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) void loadAnalytics();
  }, [canView, loadAnalytics]);

  function logResultImpressions(id: string, rows: any[]) {
    if (!id) return;
    rows.forEach((row, index) => {
      trackRecruiterSearchClick({
        searchId: id,
        candidateId: row.candidateId,
        clickType: "RESULT_IMPRESSION",
        finalScore: row.finalScore,
        semanticScore: row.semanticScore,
        rankPosition: index,
      });
    });
  }

  async function runSearch(searchText?: string) {
    const q = (searchText ?? query).trim();
    if (!q) { setError("Enter a search query."); return; }
    setLoading(true);
    setError("");
    setActionMsg("");
    setSubmittedQuery(q);
    try {
      const { data: body } = await apiClient.post("/search/candidates", { query: q });
      const payload = body && typeof body === "object" && Array.isArray(body.results) ? body : null;
      const legacyRows = Array.isArray(body) ? body : [];
      const rows = payload?.results ?? legacyRows;
      const nextSearchId = payload && typeof payload.searchId === "string" ? payload.searchId : "";
      const filtered = rows.filter(
        (r: any) => r && typeof r.candidateId === "string" && typeof r.candidateName === "string"
      );
      setSearchId(nextSearchId);
      setResults(filtered);
      logResultImpressions(nextSearchId, filtered);
      void loadAnalytics();
    } catch (e) {
      setResults([]);
      setSearchId("");
      const msg = e instanceof Error ? e.message : "Search failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function toggleSessionShortlist(candidateId: string) {
    setSessionShortlist((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function openJobPicker(candidateIds: string[], mode = "pipeline") {
    if (!canApply || candidateIds.length === 0) return;
    setSelectedJobId(openJobs[0]?.id ?? "");
    setJobPicker({ open: true, candidateIds, mode });
  }

  async function applyToJob() {
    if (!selectedJobId || jobPicker.candidateIds.length === 0) return;
    setPipelineBusy(true);
    setError("");
    setActionMsg("");
    try {
      const recommendedCandidates = results
        .filter((r) => jobPicker.candidateIds.includes(r.candidateId))
        .map((r) => ({ candidateId: r.candidateId, candidateName: r.candidateName, finalScore: r.finalScore }));
      const { data: body } = await apiClient.post(
        `/jobs/${encodeURIComponent(selectedJobId)}/applications/batch`,
        { candidateIds: jobPicker.candidateIds, recommendedCandidates, ...(searchId ? { recruiterSearchId: searchId } : {}) }
      );
      const summary = formatBatchSummary(body);
      setActionMsg(summary);
      toast.success(summary || "Added to pipeline.");
      setJobPicker({ open: false, candidateIds: [], mode: "pipeline" });
      if (jobPicker.mode === "shortlist") {
        setSessionShortlist((prev) => {
          const next = new Set(prev);
          for (const id of jobPicker.candidateIds) next.delete(id);
          return next;
        });
      }
      dispatchPipelineDataRefresh();
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add to pipeline";
      setError(msg);
      toast.error(msg);
    } finally {
      setPipelineBusy(false);
      setBusyCandidateId("");
    }
  }

  function handleAddToPipeline(candidateId: string, row: any) {
    if (searchId) {
      trackRecruiterSearchClick({
        searchId,
        candidateId,
        clickType: "ADD_PIPELINE",
        finalScore: row?.finalScore,
        semanticScore: row?.semanticScore,
      });
    }
    setBusyCandidateId(candidateId);
    openJobPicker([candidateId], "pipeline");
  }

  function handleShortlist(candidateId: string, row: any) {
    if (searchId) {
      trackRecruiterSearchClick({
        searchId,
        candidateId,
        clickType: "SHORTLIST",
        finalScore: row?.finalScore,
        semanticScore: row?.semanticScore,
      });
    }
    toggleSessionShortlist(candidateId);
    setActionMsg("Added to session shortlist. Pick a job to add to pipeline.");
  }

  function handleViewProfile(row: any) {
    if (searchId) {
      trackRecruiterSearchClick({
        searchId,
        candidateId: row.candidateId,
        clickType: "VIEW_PROFILE",
        finalScore: row.finalScore,
        semanticScore: row.semanticScore,
      });
    }
    setResumeModal({
      open: true,
      candidateId: row.candidateId,
      name: row.candidateName,
    });
  }

  if (!canView) {
    return <p className="text-sm text-muted-foreground">You do not have permission to search candidates.</p>;
  }

  return (
    <div className="max-w-4xl flex flex-col gap-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-1">AI Search</p>
        <h1 className="text-2xl font-bold tracking-tight">Recruiter Semantic Search</h1>
        <p className="text-xs text-muted-foreground mt-1 tracking-wide">
          Describe who you need in plain language. Results combine semantic similarity with skills, experience, and location signals.
        </p>
      </div>

      {/* Search Analytics Card */}
      {analytics && !analyticsLoading && (
        <Card className="bg-muted/10 border-muted">
          <CardHeader className="pb-3 px-4 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Search Analytics · 30 Days {analytics.scope === "user" && "(Your Searches)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Success Rate", value: `${analytics.searchSuccessRate ?? 0}%` },
                { label: "Shortlist Conv.", value: `${analytics.searchToShortlistConversionRate ?? 0}%` },
                { label: "Result Clicks", value: String(analytics.clickedRecommendations ?? 0) },
                { label: "Total Searches", value: String(analytics.totalSearches ?? 0) },
              ].map((stat) => (
                <div key={stat.label} className="p-3 border rounded-lg bg-background">
                  <p className="text-lg font-bold text-primary tabular-nums">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {Array.isArray(analytics.mostSearchedSkills) && analytics.mostSearchedSkills.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Most Searched Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {analytics.mostSearchedSkills.slice(0, 8).map((item: any) => (
                    <Badge key={item.skill} variant="secondary" className="text-[10px]">
                      {item.skill} ({item.searchCount})
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Query Section */}
      <Card>
        <CardContent className="pt-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="search-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Natural Language Query
              </Label>
              <RecruiterSearchQueryInput
                value={query}
                onChange={setQuery}
                disabled={loading}
                placeholder='Start typing or pick a suggestion — e.g. "Find React developers with AWS experience"'
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={loading} size="sm">
                {loading ? <ArrowsClockwise className="size-3.5 mr-1.5 animate-spin" /> : <MagnifyingGlass className="size-3.5 mr-1.5" />}
                {loading ? "Searching…" : "Run AI Search"}
              </Button>
              {sessionShortlist.size > 0 && canApply && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pipelineBusy}
                  onClick={() => openJobPicker([...sessionShortlist], "shortlist")}
                >
                  Add {sessionShortlist.size} Shortlisted to Pipeline
                </Button>
              )}
            </div>
          </form>

          {/* Featured Suggestions */}
          <div className="mt-4 border-t pt-4">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-2">Suggested Searches</p>
            <div className="flex flex-wrap gap-1.5">
              {FEATURED_SUGGESTIONS.map((example) => (
                <Button
                  key={example}
                  variant="outline"
                  size="sm"
                  className="rounded-full h-7 text-[10px] px-3 font-normal"
                  onClick={() => {
                    setQuery(example);
                    void runSearch(example);
                  }}
                >
                  {example}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status Alerts */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {actionMsg && (
        <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
          <AlertDescription className="text-xs">{actionMsg}</AlertDescription>
        </Alert>
      )}

      {/* Search Output Summary */}
      {submittedQuery && !loading && (
        <p className="text-xs font-mono text-muted-foreground">
          {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{submittedQuery}&rdquo;
        </p>
      )}

      {loading && (
        <div className="text-center py-10 space-y-2">
          <ArrowsClockwise className="size-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-xs font-mono text-muted-foreground">Generating embedding and matching candidates...</p>
        </div>
      )}

      {/* Results List */}
      {!loading && results.length > 0 && (
        <div className="border rounded-xl bg-background divide-y">
          {results.map((row, index) => {
            const finalScore = formatScore(row.finalScore);
            const semanticScore = formatScore(row.semanticScore);
            const reason = displayReason(row.recommendationReason);
            const skills = Array.isArray(row.skills) ? row.skills.slice(0, 8) : [];
            const shortlisted = sessionShortlist.has(row.candidateId);
            const busy = busyCandidateId === row.candidateId;

            return (
              <div key={row.candidateId} className="p-4 space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold text-sm text-foreground">{row.candidateName}</span>
                  {row.currentDesignation && (
                    <span className="text-xs text-muted-foreground">{row.currentDesignation}</span>
                  )}
                  {finalScore != null && (
                    <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      {finalScore}% Match
                    </Badge>
                  )}
                  {semanticScore != null && (
                    <Badge variant="secondary" className="text-[10px]">
                      Semantic {semanticScore}%
                    </Badge>
                  )}
                </div>

                <p className="text-xs text-muted-foreground italic leading-relaxed">
                  &ldquo;{reason}&rdquo;
                </p>

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {skills.map((skill) => (
                      <Badge key={`${row.candidateId}-${skill}`} variant="outline" className="text-[9px] font-normal py-0 px-1.5 bg-emerald-500/5 text-emerald-600 border-emerald-500/10">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Individual Actions */}
                <div className="flex items-center gap-1.5 pt-2 flex-wrap">
                  {canViewResume ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || pipelineBusy}
                      onClick={() => handleViewProfile(row)}
                      className="h-8 text-xs"
                    >
                      <FileText className="size-3.5 mr-1" />
                      View Profile
                    </Button>
                  ) : (
                    <Link
                      href={`/applicants?candidateId=${encodeURIComponent(row.candidateId)}`}
                      className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-8 p-0 text-xs")}
                    >
                      View Profile
                    </Link>
                  )}

                  {canApply && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={busy || pipelineBusy || openJobs.length === 0}
                        onClick={() => handleAddToPipeline(row.candidateId, row)}
                        className="h-8 text-xs font-semibold"
                      >
                        <UserPlus className="size-3.5 mr-1" />
                        {busy ? "Adding…" : "Add to pipeline"}
                      </Button>
                      <Button
                        variant={shortlisted ? "secondary" : "ghost"}
                        size="sm"
                        disabled={pipelineBusy}
                        onClick={() => handleShortlist(row.candidateId, row)}
                        className="h-8 text-xs"
                      >
                        {shortlisted ? <Check className="size-3.5 mr-1" /> : <Plus className="size-3.5 mr-1" />}
                        {shortlisted ? "Shortlisted" : "Shortlist"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No Results Fallback */}
      {!loading && submittedQuery && results.length === 0 && !error && (
        <p className="text-center py-10 text-xs text-muted-foreground font-mono">
          No matching candidates. Try clarifying qualifications or check index statuses.
        </p>
      )}

      {/* Job Picker Dialog */}
      <Dialog open={jobPicker.open} onOpenChange={(open) => !open && !pipelineBusy && setJobPicker({ open: false, candidateIds: [], mode: "pipeline" })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {jobPicker.mode === "shortlist" ? "Add Shortlisted Candidates" : "Add to Pipeline"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Select which open position pipeline to register the {jobPicker.candidateIds.length} candidate{jobPicker.candidateIds.length === 1 ? "" : "s"} under.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="jp-job">Open Job</Label>
              <Select value={selectedJobId} onValueChange={setSelectedJobId} disabled={jobsLoading || pipelineBusy || openJobs.length === 0}>
                <SelectTrigger id="jp-job">
                  <SelectValue placeholder={jobsLoading ? "Loading positions..." : "Select position"} />
                </SelectTrigger>
                <SelectContent>
                  {openJobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pipelineBusy}
              onClick={() => setJobPicker({ open: false, candidateIds: [], mode: "pipeline" })}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pipelineBusy || !selectedJobId || openJobs.length === 0}
              onClick={applyToJob}
            >
              {pipelineBusy ? "Adding…" : "Confirm Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embedded Resume Modal */}
      {resumeModal.open && (
        <ResumeCandidateModal
          open={resumeModal.open}
          onClose={() => setResumeModal({ open: false, candidateId: undefined, name: "" })}
          candidateId={resumeModal.candidateId}
          candidateName={resumeModal.name}
          userRole={role}
        />
      )}
    </div>
  );
}
