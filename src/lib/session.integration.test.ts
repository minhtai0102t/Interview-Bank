import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/prisma";

import { signInAs } from "../../tests/helpers/auth";
import { disconnectDatabase, resetDatabase } from "../../tests/helpers/database";
import { actorFromHeaders } from "./session";

const prisma = getPrisma();

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("actorFromHeaders", () => {
  it("is null for a visitor without a session cookie", async () => {
    expect(await actorFromHeaders(new Headers())).toBeNull();
  });

  it("describes the signed-in user, who starts as an ordinary USER", async () => {
    const { user, headers } = await signInAs({ name: "Una User" });

    expect(await actorFromHeaders(headers)).toEqual({ userId: user.id, role: "USER", name: "Una User" });
  });

  it("keeps two signed-in users apart", async () => {
    const [first, second] = [await signInAs({ name: "First" }), await signInAs({ name: "Second" })];

    expect(await actorFromHeaders(first.headers)).toMatchObject({ userId: first.user.id, name: "First" });
    expect(await actorFromHeaders(second.headers)).toMatchObject({ userId: second.user.id, name: "Second" });
  });

  it("is null for a cookie that was altered or never signed", async () => {
    const { headers } = await signInAs();
    const cookie = headers.get("cookie") ?? "";

    expect(cookie).toContain("session_token=");
    expect(await actorFromHeaders(new Headers({ cookie: cookie.replace(/\.[^.;]+$/, ".not-the-signature") }))).toBeNull();
    expect(await actorFromHeaders(new Headers({ cookie: cookie.replace(/\.[^.;]+$/, "") }))).toBeNull();
  });

  it("is null once the session has expired", async () => {
    const { headers, sessionToken } = await signInAs();
    await prisma.session.update({ where: { token: sessionToken }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    expect(await actorFromHeaders(headers)).toBeNull();
  });

  it("is null once the session was revoked", async () => {
    const { headers, sessionToken } = await signInAs();
    await prisma.session.delete({ where: { token: sessionToken } });

    expect(await actorFromHeaders(headers)).toBeNull();
  });

  it("is null once the user is gone", async () => {
    const { user, headers } = await signInAs();
    await prisma.user.delete({ where: { id: user.id } });

    expect(await actorFromHeaders(headers)).toBeNull();
  });

  it("follows a role change on the very next request", async () => {
    const { user, headers } = await signInAs();
    expect(await actorFromHeaders(headers)).toMatchObject({ role: "USER" });

    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    expect(await actorFromHeaders(headers)).toMatchObject({ role: "ADMIN" });

    await prisma.user.update({ where: { id: user.id }, data: { role: "USER" } });
    expect(await actorFromHeaders(headers)).toMatchObject({ role: "USER" });
  });
});
