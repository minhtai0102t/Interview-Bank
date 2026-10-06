import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("keeps a local path with its query and fragment", () => {
    expect(safeRedirectPath("/imports")).toBe("/imports");
    expect(safeRedirectPath("/questions/42?tab=answer#top")).toBe("/questions/42?tab=answer#top");
    expect(safeRedirectPath("/")).toBe("/");
  });

  it.each([
    ["a scheme-relative URL", "//evil.example/path"],
    ["a backslash host", "/\\evil.example"],
    ["a backslash pair", "\\\\evil.example"],
    ["a tab hidden inside the slashes", "/\t/evil.example"],
    ["a newline hidden inside the slashes", "/\n/evil.example"],
    ["an absolute URL", "https://evil.example/"],
    ["a script URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["a relative path without a leading slash", "imports"],
    ["an empty value", ""],
    ["a blank value", "   "],
  ])("falls back for %s", (_description, value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });

  it("falls back for values that are not text", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(42)).toBe("/");
    expect(safeRedirectPath(["/imports"])).toBe("/");
  });

  it("returns the normalized path, never the raw input", () => {
    expect(safeRedirectPath("/a/../imports")).toBe("/imports");
    expect(safeRedirectPath("/imports\t\n?x=1")).toBe("/imports?x=1");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("//evil.example", "/library")).toBe("/library");
  });

  it("does not send people back to the sign-in page", () => {
    expect(safeRedirectPath("/sign-in")).toBe("/");
    expect(safeRedirectPath("/sign-in?next=%2Fimports")).toBe("/");
    expect(safeRedirectPath("/sign-in/")).toBe("/");
    expect(safeRedirectPath("/sign-in/./")).toBe("/");
  });
});
