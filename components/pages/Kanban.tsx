"use client";

import Link from "next/link";
import { STAGES, STAGE_META } from "@/data/mockData";
import { Button } from "@/components/ui/button";
import StarRating from "@/components/ui/StarRating";
import StatusBadge from "@/components/ui/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowsClockwise,
  Briefcase,
  CaretLeft,
  CaretRight,
  Kanban as KanbanIcon,
  Tray,
  Users,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface KanbanProps {
  applicants: any[];
  setApplicants: React.Dispatch<React.SetStateAction<any[]>>;
  jobs: any[];
  onAdvanceStage?: (a: any) => Promise<void> | void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const ACTIVE_STAGES = STAGES.filter((s) => !["Hired", "Rejected"].includes(s));
const TERMINAL_STAGES = ["Hired", "Rejected"] as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function KanbanColumn({
  stage,
  cards,
  onMove,
  hasApiAdvance,
}: {
  stage: string;
  cards: any[];
  onMove: (a: any, dir: number) => void;
  hasApiAdvance: boolean;
}) {
  const meta = STAGE_META[stage] ?? { color: "var(--muted-foreground)", bg: "var(--muted)" };
  const isTerminal = TERMINAL_STAGES.includes(stage as (typeof TERMINAL_STAGES)[number]);

  return (
    <div className="flex w-[272px] shrink-0 snap-start flex-col gap-3">
      <div
        className="flex items-center justify-between rounded-lg border px-3 py-2"
        style={{ borderColor: `${meta.color}33`, backgroundColor: meta.bg }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="truncate text-xs font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
            {stage}
          </span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
          style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
        >
          {cards.length}
        </span>
      </div>

      <div
        className={cn(
          "flex min-h-[420px] flex-1 flex-col rounded-xl border bg-muted/30",
          isTerminal ? "border-dashed" : "border-border/60"
        )}
      >
        <ScrollArea className="h-[420px]">
          <div className="flex flex-col gap-2 p-2">
            {cards.map((a) => {
              const currentStageIdx = STAGES.indexOf(a.stage);
              const isFirstStage = currentStageIdx === 0;
              const isLastStage = currentStageIdx === STAGES.length - 1;

              return (
                <Card
                  key={a.id}
                  className="group border-l-[3px] shadow-sm transition-all hover:shadow-md"
                  style={{ borderLeftColor: meta.color }}
                >
                  <CardContent className="flex flex-col gap-2.5 p-3">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                        style={{ color: meta.color, backgroundColor: meta.bg }}
                      >
                        {initials(a.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/applicants?applicationId=${encodeURIComponent(a.id)}`}
                          className="block truncate text-sm font-semibold text-foreground hover:underline"
                        >
                          {a.name}
                        </Link>
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <Briefcase className="size-3 shrink-0" />
                          {a.jobTitle || "No role"}
                        </p>
                      </div>
                    </div>

                    <StarRating value={a.rating} />

                    <div className="flex items-center justify-between gap-1 border-t border-border/50 pt-2">
                      <StatusBadge label={a.stage} color={meta.color} bg={meta.bg} />
                      <div className="flex gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => onMove(a, -1)}
                          disabled={isFirstStage || hasApiAdvance}
                          aria-label="Move to previous stage"
                        >
                          <CaretLeft />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => onMove(a, 1)}
                          disabled={isLastStage}
                          aria-label="Advance to next stage"
                        >
                          <CaretRight />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {cards.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
                <Tray className="size-8 opacity-40" />
                <span className="text-xs font-medium">No candidates</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

export default function Kanban({
  applicants,
  setApplicants,
  onAdvanceStage,
  onRefresh,
  refreshing = false,
}: KanbanProps) {
  const hasApiAdvance = typeof onAdvanceStage === "function";
  const activeCount = applicants.filter((a) => ACTIVE_STAGES.includes(a.stage)).length;
  const hiredCount = applicants.filter((a) => a.stage === "Hired").length;
  const rejectedCount = applicants.filter((a) => a.stage === "Rejected").length;

  const getColApplicants = (stage: string) => applicants.filter((a) => a.stage === stage);

  const moveCandidate = (a: any, dir: number) => {
    if (hasApiAdvance && dir === 1) {
      void onAdvanceStage!(a);
      return;
    }
    if (hasApiAdvance && dir === -1) return;

    const idx = STAGES.indexOf(a.stage);
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= STAGES.length) return;

    const newStage = STAGES[nextIdx];
    setApplicants((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, stage: newStage } : x))
    );
  };

  return (
    <div className="flex min-w-0 w-full flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Pipeline View
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Kanban Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag-free stage management — advance candidates through your hiring funnel.
          </p>
        </div>
        {onRefresh ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <ArrowsClockwise className={cn("size-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "In pipeline", value: activeCount, icon: KanbanIcon },
          { label: "Total", value: applicants.length, icon: Users },
          { label: "Hired", value: hiredCount, icon: Users, accent: STAGE_META.Hired.color },
          { label: "Rejected", value: rejectedCount, icon: Users, accent: STAGE_META.Rejected.color },
        ].map(({ label, value, icon: Icon, accent }) => (
          <Card key={label} className="border-border/60 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p
                  className="mt-1 text-2xl font-bold tabular-nums"
                  style={accent ? { color: accent } : undefined}
                >
                  {value}
                </p>
              </div>
              <div className="rounded-lg bg-muted p-2">
                <Icon className="size-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="min-w-0 w-full overflow-hidden">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-4">
        {ACTIVE_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            cards={getColApplicants(stage)}
            onMove={moveCandidate}
            hasApiAdvance={hasApiAdvance}
          />
        ))}

        <div className="flex shrink-0 flex-col justify-center px-1">
          <Separator orientation="vertical" className="h-24" />
        </div>

        {TERMINAL_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            cards={getColApplicants(stage)}
            onMove={moveCandidate}
            hasApiAdvance={hasApiAdvance}
          />
        ))}
        </div>
      </div>
    </div>
  );
}
