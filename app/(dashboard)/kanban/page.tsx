"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Kanban from "@/components/pages/Kanban";
import { STAGES, STAGE_LABEL_TO_API } from "@/data/mockData";
import { APPLICATION_STAGE_TO_UI_LABEL } from "@/src/lib/applications-drilldown-ui";
import { isValidStageTransition } from "@/src/lib/application-stage-transitions";
import { invalidateSidebarNav } from "@/hooks/queries/useSidebarNav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";

const API_ORDER = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "TECHNICAL",
  "FINAL_ROUND",
  "OFFER_SENT",
  "HIRED",
  "REJECTED",
];

function flattenPipeline(grouped) {
  const out = [];
  for (const stage of API_ORDER) {
    const apps = grouped[stage] ?? [];
    for (const a of apps) {
      out.push({
        id: a.id,
        version: a.version,
        stageApi: a.stage,
        stage: APPLICATION_STAGE_TO_UI_LABEL[a.stage] ?? a.stage,
        name: a.candidate?.candidateName ?? "Candidate",
        jobTitle: a.job?.title ?? "",
        rating: a.rating ?? 0,
      });
    }
  }
  return out;
}

function KanbanLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex w-[272px] shrink-0 flex-col gap-3">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-[420px] rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const queryClient = useQueryClient();
  const [applicants, setApplicants] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/pipeline", { credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = body?.message || body?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    setApplicants(flattenPipeline(body));
  }, []);

  const refresh = useCallback(async () => {
    setLoadState("loading");
    setError(null);
    try {
      await load();
      setLoadState("ok");
    } catch (e) {
      setLoadState("error");
      setError(e instanceof Error ? e.message : "Failed to load pipeline");
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdvanceStage = useCallback(async (a) => {
    try {
      const idx = STAGES.indexOf(a.stage);
      if (idx < 0 || idx >= STAGES.length - 1) return;
      const nextLabel = STAGES[idx + 1];
      const nextApi = STAGE_LABEL_TO_API[nextLabel];
      if (!nextApi || !isValidStageTransition(a.stageApi, nextApi)) return;
      const res = await fetch(`/api/applications/${a.id}/stage`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: nextApi, version: a.version }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(
          body?.message || body?.error || `Stage update failed (${res.status})`,
        );
        return;
      }
      const updated = await res.json().catch(() => null);
      if (!updated?.id) return;
      setApplicants((prev) =>
        prev.map((x) =>
          x.id === a.id
            ? {
                ...x,
                stageApi: updated.stage,
                stage: APPLICATION_STAGE_TO_UI_LABEL[updated.stage] ?? updated.stage,
                version: updated.version,
              }
            : x
        )
      );
      void invalidateSidebarNav(queryClient);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Stage update failed");
    }
  }, [queryClient]);

  if (loadState === "loading" && applicants.length === 0) {
    return <KanbanLoading />;
  }

  if (loadState === "error" && error) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <Warning className="size-4" />
          <AlertTitle>Could not load pipeline</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => void refresh()}>
          <ArrowsClockwise className="size-4" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <Kanban
      applicants={applicants}
      setApplicants={setApplicants}
      jobs={[]}
      onAdvanceStage={onAdvanceStage}
      onRefresh={() => void refresh()}
      refreshing={loadState === "loading"}
    />
  );
}
