"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { canEditCandidate, canReadResume, canUploadResume } from "@/src/lib/rbac";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import RecommendedRolesPanel from "@/components/RecommendedRolesPanel";
import { NOTIFICATIONS_REFRESH_EVENT } from "@/components/NotificationBell";
import { DownloadSimple, UploadSimple, ArrowsClockwise, FileText, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface ResumeCandidateModalProps {
  open: boolean;
  onClose: () => void;
  candidateId: string | undefined;
  userRole: string | undefined;
  candidateName: string | undefined;
}

export default function ResumeCandidateModal({
  open,
  onClose,
  candidateId,
  userRole,
  candidateName,
}: ResumeCandidateModalProps) {
  const canUpload = canUploadResume(userRole);
  const canRead = canReadResume(userRole);
  const canApplyParse = canEditCandidate(userRole);

  const [loading, setLoading] = useState(false);
  const [candidate, setCandidate] = useState<any>(null);
  const [parseStatus, setParseStatus] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [applyName, setApplyName] = useState("");
  const [applySkills, setApplySkills] = useState("");
  const [applyYears, setApplyYears] = useState("0");
  const [applySummary, setApplySummary] = useState("");
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyOk, setApplyOk] = useState<string | null>(null);
  const [recommendationsRefreshKey, setRecommendationsRefreshKey] = useState(0);
  const [showRawJson, setShowRawJson] = useState(false);

  const load = useCallback(async () => {
    if (!candidateId || !open) return;
    setLoading(true);
    setErr(null);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/candidates/${candidateId}`, { credentials: "same-origin" }),
        fetch(`/api/candidates/${candidateId}/parse-status`, { credentials: "same-origin" }),
      ]);
      const cBody = await cRes.json().catch(() => ({}));
      if (!cRes.ok) {
        const msg = typeof cBody?.message === "string" ? cBody.message : cBody?.error;
        throw new Error(msg || `Failed to load candidate (${cRes.status})`);
      }
      setCandidate(cBody);
      const pBody = await pRes.json().catch(() => ({}));
      if (pRes.ok) setParseStatus(pBody);
      else setParseStatus(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load candidate data");
    } finally {
      setLoading(false);
    }
  }, [candidateId, open]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) setShowRawJson(false);
  }, [open]);

  const resumeUrl = candidate && typeof candidate.resumeUrl === "string" ? candidate.resumeUrl.trim() : "";
  const resumeFileName =
    candidate && typeof candidate.resumeFileName === "string" ? candidate.resumeFileName.trim() : "";

  async function handleDownload() {
    if (!candidateId) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/resume`, { credentials: "same-origin" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message || j?.error || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      let filename = resumeFileName || "resume";
      const m = /filename\*?=(?:UTF-8''|")?([^";\n]+)/i.exec(cd);
      if (m?.[1]) {
        try {
          filename = decodeURIComponent(m[1].replace(/^"|"$/g, ""));
        } catch {
          filename = m[1].replace(/^"|"$/g, "");
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !candidateId) return;
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/candidates/${candidateId}/resume`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Upload failed (${res.status})`);
      }
      setCandidate(body);
      const pRes = await fetch(`/api/candidates/${candidateId}/parse-status`, { credentials: "same-origin" });
      const pBody = await pRes.json().catch(() => ({}));
      if (pRes.ok) setParseStatus(pBody);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  const refreshParseStatus = useCallback(async () => {
    if (!candidateId) return;
    try {
      const pRes = await fetch(`/api/candidates/${candidateId}/parse-status`, { credentials: "same-origin" });
      const pBody = await pRes.json().catch(() => ({}));
      if (pRes.ok) setParseStatus(pBody);
    } catch {
      // Ignored
    }
  }, [candidateId]);

  async function handleParse(options = { force: false }) {
    if (!candidateId) return;
    setErr(null);
    setBusy(true);
    try {
      const q = options.force ? "?force=1" : "";
      const res = await fetch(`/api/candidates/${candidateId}/resume/parse${q}`, {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Parse request failed (${res.status})`);
      }
      await refreshParseStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || !candidateId) return;
    if (parseStatus?.status !== "PENDING" && parseStatus?.status !== "PROCESSING") return;
    const t = setInterval(() => {
      void refreshParseStatus();
    }, 2500);
    return () => clearInterval(t);
  }, [open, candidateId, parseStatus?.status, refreshParseStatus]);

  useEffect(() => {
    const r = parseStatus?.result;
    if (parseStatus?.status !== "COMPLETED" || r == null || typeof r !== "object") return;
    setApplyName(typeof r.name === "string" ? r.name : "");
    setApplySkills(Array.isArray(r.skills) ? r.skills.join(", ") : "");
    const y = r.experience?.years;
    setApplyYears(typeof y === "number" && Number.isFinite(y) ? String(y) : "0");
    setApplySummary(typeof r.experience?.summary === "string" ? r.experience.summary : "");
    setApplyOk(null);
  }, [parseStatus?.resumeParseJobId, parseStatus?.status]);

  async function handleApplyParsedToProfile() {
    if (!candidateId || !parseStatus?.resumeParseJobId) return;
    setErr(null);
    setApplyOk(null);
    setApplyBusy(true);
    try {
      const years = parseFloat(applyYears);
      const skills = applySkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/candidates/${candidateId}/resume/parse/apply`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeParseJobId: parseStatus.resumeParseJobId,
          result: {
            name: applyName.trim(),
            skills,
            experience: {
              years: Number.isFinite(years) ? years : 0,
              summary: applySummary,
            },
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `Apply failed (${res.status})`);
      }
      setCandidate(body);
      setApplyOk("Candidate profile updated from this parse.");
      setRecommendationsRefreshKey((k) => k + 1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplyBusy(false);
    }
  }

  const parseLabel =
    parseStatus?.status == null
      ? "—"
      : parseStatus.status === "COMPLETED"
      ? "Done"
      : parseStatus.status === "FAILED"
      ? "Failed"
      : parseStatus.status === "PROCESSING"
      ? "Processing"
      : "Pending";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {candidateName ? `Résumé — ${candidateName}` : "Résumé"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Manage candidate's resume upload and parse properties.
          </DialogDescription>
        </DialogHeader>

        {!candidateId ? (
          <p className="text-xs text-muted-foreground">
            No candidate ID for this row (local-only entry). Résumé actions require a saved application from the server.
          </p>
        ) : (
          <div className="space-y-4 py-2">
            {loading && <p className="text-xs text-muted-foreground">Loading file parameters...</p>}

            {err && (
              <Alert variant="destructive">
                <AlertDescription className="text-xs">{err}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              <div className="text-xs text-foreground/90">
                <span className="font-semibold text-muted-foreground mr-1">File on Record:</span>
                {resumeUrl ? (
                  <span className="font-mono bg-muted py-0.5 px-1.5 rounded">{resumeFileName || "Uploaded"}</span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </div>

              {/* Actions toolbar */}
              <div className="flex flex-wrap gap-2 items-center">
                {canRead && resumeUrl && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={handleDownload} className="h-8 text-xs font-semibold">
                    <DownloadSimple className="size-3.5 mr-1" />
                    Download File
                  </Button>
                )}

                {canUpload && (
                  <label className={cn(
                    "inline-flex items-center justify-center rounded-lg border h-8 px-3 text-xs font-semibold transition-all cursor-pointer bg-primary/10 border-primary/20 text-primary hover:bg-primary/20",
                    busy && "opacity-50 pointer-events-none"
                  )}>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      disabled={busy}
                      onChange={handleUpload}
                    />
                    <UploadSimple className="size-3.5 mr-1" />
                    {busy ? "Working…" : "Upload / Replace"}
                  </label>
                )}

                {canUpload && resumeUrl && (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => void handleParse({ force: false })} className="h-8 text-xs font-semibold">
                      <ArrowsClockwise className={cn("size-3.5 mr-1", busy && "animate-spin")} />
                      Run parse job
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleParse({ force: true })} className="h-8 text-xs text-muted-foreground hover:text-foreground" title="Enqueue a new job even if parsed before">
                      Force Re-parse
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Parse Status Card */}
            <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-semibold text-muted-foreground">Parse Status:</span>
                <span className={cn(
                  "font-medium px-2 py-0.5 rounded text-[10px]",
                  parseStatus?.status === "COMPLETED" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                  parseStatus?.status === "FAILED" ? "bg-destructive/10 text-destructive" :
                  "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}>
                  {parseLabel}
                </span>
              </div>

              {parseStatus?.status === "PENDING" || parseStatus?.status === "PROCESSING" ? (
                <p className="text-[10px] text-muted-foreground leading-normal">
                  Jobs stay pending until the parse worker runs (cron interval, or manually hit `api/cron/process-parse-jobs`).
                </p>
              ) : null}

              {parseStatus?.error && (
                <Alert variant="destructive" className="py-2.5">
                  <AlertDescription className="text-[10px] font-mono whitespace-pre-wrap">{parseStatus.error}</AlertDescription>
                </Alert>
              )}

              {parseStatus?.status === "COMPLETED" && parseStatus?.result != null && (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2"
                    onClick={() => setShowRawJson((v) => !v)}
                  >
                    {showRawJson ? "Hide Raw JSON" : "Show Raw JSON"}
                  </Button>
                  {showRawJson && (
                    <pre className="text-[10px] bg-muted/60 p-2.5 rounded border overflow-auto max-h-40 font-mono text-muted-foreground">
                      {JSON.stringify(parseStatus.result, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {parseStatus?.status === "COMPLETED" && parseStatus?.result != null && canApplyParse && (
                <div className="border-t pt-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground">Review & Apply to Profile</h4>
                    <p className="text-[10px] text-muted-foreground leading-normal mt-0.5">
                      Confirming will save the name, experience (years), and parsed skills to the candidate database profile.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="apply-name" className="text-xs">Candidate Name</Label>
                      <Input
                        id="apply-name"
                        value={applyName}
                        onChange={(e) => setApplyName(e.target.value)}
                        placeholder="Full name"
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="apply-years" className="text-xs">Experience (years)</Label>
                      <Input
                        id="apply-years"
                        type="number"
                        min={0}
                        step={0.5}
                        value={applyYears}
                        onChange={(e) => setApplyYears(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="apply-skills" className="text-xs">Skills (comma-separated)</Label>
                      <Textarea
                        id="apply-skills"
                        value={applySkills}
                        onChange={(e) => setApplySkills(e.target.value)}
                        rows={3}
                        maxLength={18000}
                        placeholder="e.g. TypeScript, AWS, Node.js"
                        className="text-xs"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="apply-summary" className="text-xs">Experience Summary</Label>
                      <Textarea
                        id="apply-summary"
                        value={applySummary}
                        onChange={(e) => setApplySummary(e.target.value)}
                        rows={4}
                        maxLength={1200}
                        placeholder="Detailed work experience history..."
                        className="text-xs"
                      />
                    </div>
                  </div>

                  {applyOk && (
                    <Alert className="border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 py-2">
                      <AlertDescription className="text-xs flex items-center gap-1.5">
                        <CheckCircle className="size-4" />
                        {applyOk}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="pt-1">
                    <Button
                      size="sm"
                      disabled={applyBusy || !parseStatus?.resumeParseJobId}
                      onClick={handleApplyParsedToProfile}
                      className="h-8 text-xs font-semibold"
                    >
                      {applyBusy ? "Saving…" : "Confirm & Apply to Profile"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Recommendations Section */}
            {parseStatus?.status === "COMPLETED" && (applyOk || recommendationsRefreshKey > 0) && (
              <RecommendedRolesPanel
                candidateId={candidateId}
                enabled
                refreshKey={recommendationsRefreshKey}
                userRole={userRole}
                onApplied={() => {
                  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
                }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
