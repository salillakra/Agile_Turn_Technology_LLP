/** Dispatched after pipeline changes so `/applicants` reloads without a full page refresh. */
export const APPLICANTS_REFRESH_EVENT = "applicants-refresh";

/** Dispatched so job list cards refresh applicant counts. */
export const JOBS_LIST_REFRESH_EVENT = "jobs-list-refresh";

export function dispatchApplicantsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APPLICANTS_REFRESH_EVENT));
}

/** Refresh applicants list and open-positions applicant counts. */
export function dispatchPipelineDataRefresh(): void {
  if (typeof window === "undefined") return;
  dispatchApplicantsRefresh();
  window.dispatchEvent(new CustomEvent(JOBS_LIST_REFRESH_EVENT));
}
