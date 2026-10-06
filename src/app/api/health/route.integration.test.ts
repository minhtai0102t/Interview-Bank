import { afterEach, describe, expect, it, vi } from "vitest";

async function loadHealthRoute() {
  vi.resetModules();
  const prisma = await import("@/lib/prisma");
  const route = await import("./route");
  return { GET: route.GET, disconnect: () => prisma.getPrisma().$disconnect() };
}

describe("GET /api/health", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports ok when the database answers", async () => {
    const { GET, disconnect } = await loadHealthRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    await disconnect();
  });

  it("reports unavailable without leaking details when the database is unreachable", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://nobody:secret-pass@127.0.0.1:1/missing");
    const { GET, disconnect } = await loadHealthRoute();

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    expect(body).not.toContain("secret-pass");
    await disconnect();
  });
});
