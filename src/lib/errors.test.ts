import { describe, expect, it } from "vitest";

import { DomainError, isDomainError } from "./errors";

describe("DomainError", () => {
  it.each([
    ["INVALID_INPUT", 400],
    ["UNAUTHORIZED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
    ["RATE_LIMITED", 429],
  ] as const)("%s maps to HTTP %i", (code, status) => {
    expect(new DomainError(code).status).toBe(status);
  });

  it("is an Error that carries its code", () => {
    const error = new DomainError("NOT_FOUND");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.name).toBe("DomainError");
  });

  it("has a readable default message and accepts a custom one", () => {
    expect(new DomainError("FORBIDDEN").message).toBe("FORBIDDEN");
    expect(new DomainError("INVALID_INPUT", "Title is required").message).toBe("Title is required");
  });

  it("keeps the underlying cause", () => {
    const cause = new Error("boom");

    expect(new DomainError("CONFLICT", "Edited elsewhere", { cause }).cause).toBe(cause);
  });
});

describe("isDomainError", () => {
  it("recognizes domain errors, optionally by code", () => {
    const error = new DomainError("UNAUTHORIZED");

    expect(isDomainError(error)).toBe(true);
    expect(isDomainError(error, "UNAUTHORIZED")).toBe(true);
    expect(isDomainError(error, "FORBIDDEN")).toBe(false);
  });

  it("rejects everything else", () => {
    expect(isDomainError(new Error("UNAUTHORIZED"))).toBe(false);
    expect(isDomainError({ code: "UNAUTHORIZED" })).toBe(false);
    expect(isDomainError(undefined)).toBe(false);
  });
});
