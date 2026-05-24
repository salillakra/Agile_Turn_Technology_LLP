import { NextResponse } from "next/server";

/**
 * Standard error response for API routes: { code, message, details? }.
 * Use for consistent frontend error handling.
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  details?: object
): NextResponse {
  const body: { code: string; message: string; details?: object } = { code, message };
  if (details != null) {
    body.details = details;
  }
  return NextResponse.json(body, { status });
}
