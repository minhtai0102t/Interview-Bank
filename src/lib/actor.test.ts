import { describe, expect, it } from "vitest";

import { requireActor, requireAdmin, type Actor } from "./actor";
import { isDomainError } from "./errors";

const user: Actor = { userId: "user-1", role: "USER", name: "Una User" };
const admin: Actor = { userId: "admin-1", role: "ADMIN", name: "Ada Admin" };

function failureOf(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("requireActor", () => {
  it("returns the signed-in actor", () => {
    expect(requireActor(user)).toBe(user);
  });

  it("refuses an anonymous visitor as UNAUTHORIZED", () => {
    expect(isDomainError(failureOf(() => requireActor(null)), "UNAUTHORIZED")).toBe(true);
  });
});

describe("requireAdmin", () => {
  it("returns an administrator", () => {
    expect(requireAdmin(admin)).toBe(admin);
  });

  it("refuses an anonymous visitor as UNAUTHORIZED", () => {
    expect(isDomainError(failureOf(() => requireAdmin(null)), "UNAUTHORIZED")).toBe(true);
  });

  it("refuses an ordinary user as FORBIDDEN", () => {
    expect(isDomainError(failureOf(() => requireAdmin(user)), "FORBIDDEN")).toBe(true);
  });
});
