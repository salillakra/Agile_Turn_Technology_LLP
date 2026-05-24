import { NextResponse } from "next/server";

/** GET /api/auth/demo-login-config — whether demo quick-login buttons should be shown (no secrets). */
export async function GET() {
  return NextResponse.json({
    demoLoginEnabled: process.env.ENABLE_DEMO_AUTH === "true",
  });
}
