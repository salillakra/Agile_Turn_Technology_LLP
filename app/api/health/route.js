import { prisma } from "@/src/lib/prisma";

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    return Response.json({
      ok: true,
      database: "connected",
      userCount,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        database: "disconnected",
        error: err.message,
      },
      { status: 500 }
    );
  }
}
