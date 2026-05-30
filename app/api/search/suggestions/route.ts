import { NextResponse } from "next/server";
import { requireApiAuth } from "@/src/lib/api-auth";
import {
  filterRecruiterSearchSuggestions,
  recruiterSearchSuggestionCategoryLabel,
} from "@/src/lib/ai/recruiter-search-suggestions";
import { canViewCandidates } from "@/src/lib/rbac";

export const runtime = "nodejs";

/**
 * GET /api/search/suggestions?q=react&limit=8
 *
 * Autocomplete suggestions for recruiter semantic search (curated prompts).
 */
export async function GET(request: Request) {
  const auth = await requireApiAuth(canViewCandidates);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limitRaw = searchParams.get("limit");
  const limitNum = limitRaw != null ? Number(limitRaw) : NaN;
  const limit = Number.isFinite(limitNum)
    ? Math.min(20, Math.max(1, Math.trunc(limitNum)))
    : 8;

  const suggestions = filterRecruiterSearchSuggestions(q, { limit });

  return NextResponse.json({
    query: q,
    suggestions: suggestions.map((s) => ({
      text: s.text,
      label: s.label ?? s.text,
      category: s.category,
      categoryLabel: recruiterSearchSuggestionCategoryLabel(s.category),
    })),
  });
}
