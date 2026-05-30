/**
 * Fire-and-forget recruiter AI search click telemetry.
 *
 * @param {object} params
 * @param {string} params.searchId
 * @param {string} params.candidateId
 * @param {"VIEW_PROFILE"|"ADD_PIPELINE"|"SHORTLIST"|"RESULT_IMPRESSION"} params.clickType
 * @param {number} [params.finalScore]
 * @param {number} [params.semanticScore]
 * @param {number} [params.rankPosition]
 */
export function trackRecruiterSearchClick(params) {
  if (!params?.searchId || !params?.candidateId) return;
  void fetch("/api/search/analytics/event", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {});
}
