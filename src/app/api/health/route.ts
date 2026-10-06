import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers: noStore });
  } catch (error) {
    // Name only: error messages can contain connection details.
    console.error("Health check failed:", error instanceof Error ? error.name : "unknown error");
    return Response.json({ status: "unavailable" }, { status: 503, headers: noStore });
  }
}
