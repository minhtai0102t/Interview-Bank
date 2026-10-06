import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { GET, POST } from "@/app/api/auth/[...all]/route";
import { getPrisma } from "@/lib/prisma";
import { actorFromHeaders } from "@/lib/session";

import { signInAs } from "../helpers/auth";
import { disconnectDatabase, resetDatabase } from "../helpers/database";
import { TEST_AUTH_ENV } from "../setup/auth-env";

const prisma = getPrisma();
const origin = TEST_AUTH_ENV.BETTER_AUTH_URL;

let addressCounter = 0;
/** Better Auth limits requests per client address; every request gets its own unless a test says otherwise. */
function freshAddress(): string {
  addressCounter += 1;
  return `198.51.100.${addressCounter}`;
}

function post(
  path: string,
  body: unknown,
  options: { headers?: Headers; address?: string; origin?: string } = {},
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", options.origin ?? origin);
  headers.set("x-forwarded-for", options.address ?? freshAddress());
  return POST(new Request(`${origin}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

function get(path: string, headers = new Headers()): Promise<Response> {
  headers.set("x-forwarded-for", freshAddress());
  return GET(new Request(`${origin}/api/auth${path}`, { headers }));
}

/** Where a redirect response sends the browser, as a path on this site. */
function redirectTarget(response: Response): string {
  const url = new URL(response.headers.get("location") ?? "", origin);
  expect(url.origin).toBe(origin);
  return `${url.pathname}${url.search}`;
}

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("starting a sign-in", () => {
  it.each([
    ["google", "accounts.google.com", TEST_AUTH_ENV.GOOGLE_CLIENT_ID],
    ["github", "github.com", TEST_AUTH_ENV.GITHUB_CLIENT_ID],
  ])("sends people to %s with this application's callback address", async (provider, host, clientId) => {
    const response = await post("/sign-in/social", { provider, callbackURL: "/imports" });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string; redirect: boolean };
    const target = new URL(body.url);
    expect(body.redirect).toBe(true);
    expect(target.host).toBe(host);
    expect(target.searchParams.get("client_id")).toBe(clientId);
    expect(target.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/${provider}`);
    expect(target.searchParams.get("state")).toBeTruthy();
    // The state is kept in a cookie, so nothing was written to the database.
    expect(response.headers.getSetCookie().length).toBeGreaterThan(0);
    expect(await prisma.verification.count()).toBe(0);
  });

  it("refuses a provider that is not offered", async () => {
    const response = await post("/sign-in/social", { provider: "facebook", callbackURL: "/" });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it("refuses to return people to another site afterwards", async () => {
    const response = await post("/sign-in/social", { provider: "google", callbackURL: "https://evil.example/steal" });

    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("accounts.google.com");
  });

  it("has no sign-in or sign-up with a password", async () => {
    const credentials = { name: "Someone", email: "someone@example.test", password: "correct horse battery" };

    for (const path of ["/sign-in/email", "/sign-up/email"]) {
      const response = await post(path, credentials);

      expect(response.status, path).toBeGreaterThanOrEqual(400);
      expect(response.status, path).toBeLessThan(500);
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it("slows down repeated attempts from one address", async () => {
    const address = freshAddress();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < 10; attempt += 1) {
      statuses.push((await post("/sign-in/social", { provider: "google", callbackURL: "/" }, { address })).status);
    }

    expect(statuses[0]).toBe(200);
    expect(statuses).toContain(429);
    expect(await prisma.rateLimit.count()).toBeGreaterThan(0);
  });
});

describe("coming back from a provider", () => {
  it("shows the sign-in page again when the person declines", async () => {
    const started = await post("/sign-in/social", { provider: "google", callbackURL: "/imports" });
    const state = new URL(((await started.json()) as { url: string }).url).searchParams.get("state");
    const cookie = started.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");

    const response = await get(`/callback/google?error=access_denied&state=${state}`, new Headers({ cookie }));

    expect(response.status).toBe(302);
    expect(redirectTarget(response)).toBe("/sign-in?error=access_denied");
    expect(await prisma.user.count()).toBe(0);
  });

  it("shows the sign-in page again when the return trip cannot be trusted", async () => {
    const response = await get("/callback/google?code=stolen&state=forged");

    expect(response.status).toBe(302);
    expect(redirectTarget(response)).toBe("/sign-in?error=state_mismatch");
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("the session", () => {
  it("is returned for the cookie's owner", async () => {
    const { user, headers } = await signInAs({ name: "Una User" });

    const response = await get("/get-session", headers);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ user: { id: user.id, name: "Una User", role: "USER" } });
  });

  it("is empty for a visitor", async () => {
    const response = await get("/get-session");

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("ends on sign-out, for good", async () => {
    const { headers } = await signInAs();
    expect(await actorFromHeaders(headers)).not.toBeNull();

    const response = await post("/sign-out", {}, { headers });

    expect(response.status).toBe(200);
    expect(await prisma.session.count()).toBe(0);
    expect(await actorFromHeaders(headers)).toBeNull();
  });

  it("is not ended by a request that comes from another site", async () => {
    const { headers } = await signInAs();

    const response = await post("/sign-out", {}, { headers, origin: "https://evil.example" });

    expect(response.status).toBe(403);
    expect(await prisma.session.count()).toBe(1);
    expect(await actorFromHeaders(headers)).not.toBeNull();
  });

  it("does not let people grant themselves a role", async () => {
    const { user, headers } = await signInAs({ name: "Una User" });

    await post("/update-user", { name: "Una Renamed", role: "ADMIN" }, { headers });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("USER");
    expect(await actorFromHeaders(headers)).toMatchObject({ role: "USER" });
  });
});
