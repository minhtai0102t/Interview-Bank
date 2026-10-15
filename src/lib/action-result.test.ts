import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/errors";

import { fromThrown } from "./action-result";

describe("fromThrown", () => {
  it("preserves explicit domain validation messages", () => {
    expect(fromThrown(new DomainError("INVALID_INPUT", "Title is required."), "Could not save draft.")).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      error: "Title is required.",
    });
  });

  it("turns an expired session into safe reauthentication guidance", () => {
    const result = fromThrown(new DomainError("UNAUTHORIZED"), "Could not save draft.", "/my-questions/new");

    expect(result).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
      error: expect.stringMatching(/sign in/i),
      recovery: {
        label: expect.stringMatching(/sign in/i),
        href: "/sign-in?next=%2Fmy-questions%2Fnew",
      },
    });
  });

  it("hides unexpected internal errors behind the supplied fallback", () => {
    expect(fromThrown(new Error("database connection leaked"), "Could not save draft.")).toEqual({
      ok: false,
      code: "CONFLICT",
      error: "Could not save draft.",
    });
  });
});