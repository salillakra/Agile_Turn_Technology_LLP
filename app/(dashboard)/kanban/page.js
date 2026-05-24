"use client";

import { useCallback, useEffect, useState } from "react";
import Kanban from "@/components/pages/Kanban";
import { STAGES, STAGE_LABEL_TO_API } from "@/data/mockData";
import { APPLICATION_STAGE_TO_UI_LABEL } from "@/src/lib/applications-drilldown-ui";
import { isValidStageTransition } from "@/src/lib/application-stage-transitions";

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

export default function KanbanPage() {
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

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setError(null);
    load()
      .then(() => {
        if (!cancelled) setLoadState("ok");
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadState("error");
          setError(e instanceof Error ? e.message : "Failed to load pipeline");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

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
      if (!res.ok) return;
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
    } catch {
      // Fire-and-forget advance must not become an unhandled rejection.
    }
  }, []);

  if (loadState === "loading") {
    return <p style={{ fontFamily: "'DM Mono',monospace", color: "#64748B" }}>Loading pipeline…</p>;
  }
  if (loadState === "error" && error) {
    return (
      <div
        role="alert"
        style={{
          padding: "14px 18px",
          borderRadius: 8,
          background: "rgba(248,113,113,.12)",
          border: "1px solid rgba(248,113,113,.4)",
          color: "#FCA5A5",
          fontFamily: "'DM Mono',monospace",
          fontSize: 12,
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <Kanban applicants={applicants} setApplicants={setApplicants} jobs={[]} onAdvanceStage={onAdvanceStage} />
  );
}
