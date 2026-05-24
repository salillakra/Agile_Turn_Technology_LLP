/** List applications with filters (aligned with `GET /api/applications` query params). */
export const DRILLDOWN_APPLICATIONS_API = "/api/applications";

/** App route for applicants list; uses same `stage` / `source` query names as the API (`ApplicationStage`, `CandidateSource`). */
export const DRILLDOWN_APPLICANTS_PAGE = "/applicants";

/** Query segment for `?stage=…` (no leading `?`). */
export function applicationsStageQuery(stage: string): string {
  return `stage=${encodeURIComponent(stage)}`;
}

/** Query segment for `?source=…` or `null` when source is unknown / not a Prisma enum. */
export function applicationsSourceQuery(source: string): string | null {
  if (source === "UNKNOWN") return null;
  return `source=${encodeURIComponent(source)}`;
}
