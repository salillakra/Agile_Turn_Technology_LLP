"use client";

import { T, C } from "@/lib/helpers";
import { STAGES, STAGE_META } from "@/data/mockData";
import Button from "@/components/ui/Button";
import StarRating from "@/components/ui/StarRating";

export default function Kanban({ applicants, setApplicants, jobs: _jobs, onAdvanceStage }) {
  const kanbanStages = STAGES.filter((s) => !["Hired", "Rejected"].includes(s));
  const col = (stage) => applicants.filter((a) => a.stage === stage);
  const move = (a, dir) => {
    if (typeof onAdvanceStage === "function" && dir === 1) {
      void onAdvanceStage(a);
      return;
    }
    if (typeof onAdvanceStage === "function" && dir === -1) return;
    const idx = STAGES.indexOf(a.stage);
    const ni = idx + dir;
    if (ni < 0 || ni >= STAGES.length) return;
    const newStage = STAGES[ni];
    setApplicants((prev) => prev.map((x) => (x.id === a.id ? { ...x, stage: newStage } : x)));
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <p style={{ ...T.mono, margin: "0 0 4px", color: "#3B82F6", textTransform: "uppercase", letterSpacing: ".1em" }}>Pipeline View</p>
        <h1 style={T.h1}>Kanban Board</h1>
      </div>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
        {kanbanStages.map((stage) => {
          const cards = col(stage);
          const m = STAGE_META[stage];
          return (
            <div key={stage} style={{ minWidth: 200, maxWidth: 220, flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ ...T.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: m.color }}>{stage}</span>
                <span style={{ background: m.bg, color: m.color, borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "2px 8px", fontFamily: "'DM Mono',monospace" }}>{cards.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {cards.map((a) => (
                  <div key={a.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", borderTop: `2px solid ${m.color}` }}>
                    <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600, color: "var(--text-heading-soft)" }}>{a.name}</p>
                    <p style={{ ...T.mono, margin: "0 0 8px", fontSize: 10, color: "var(--text-muted)" }}>{a.jobTitle?.slice(0, 22)}</p>
                    <StarRating value={a.rating} />
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      <Button
                        sm
                        variant="ghost"
                        onClick={() => move(a, -1)}
                        disabled={STAGES.indexOf(a.stage) === 0 || typeof onAdvanceStage === "function"}
                        aria-label={`Move ${a.name} to previous stage`}
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        ←
                      </Button>
                      <Button
                        sm
                        variant="ghost"
                        onClick={() => move(a, 1)}
                        disabled={STAGES.indexOf(a.stage) === STAGES.length - 1}
                        aria-label={`Move ${a.name} to next stage`}
                        style={{ padding: "3px 8px", fontSize: 11 }}
                      >
                        →
                      </Button>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <div style={{ border: "1px dashed rgba(255,255,255,.06)", borderRadius: 10, padding: 16, textAlign: "center", ...T.mono, fontSize: 10, color: "#2D3748" }}>Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
