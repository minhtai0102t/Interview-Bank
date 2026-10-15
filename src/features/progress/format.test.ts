import { describe, expect, it } from "vitest";

import { formatSessionTimestamp } from "./format";

describe("formatSessionTimestamp", () => {
  it("uses the saved profile time zone for recent session labels across a date boundary", () => {
    expect(formatSessionTimestamp(new Date("2026-10-14T00:30:00.000Z"), "America/New_York")).toContain("Oct 13, 2026");
    expect(formatSessionTimestamp(new Date("2026-10-14T00:30:00.000Z"), "UTC")).toContain("Oct 14, 2026");
  });
});