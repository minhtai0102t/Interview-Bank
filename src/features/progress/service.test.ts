import { describe, expect, it } from "vitest";

import { activityDate } from "./service";

describe("activityDate", () => {
  it("maps UTC timestamps into the viewer's calendar date", () => {
    expect(activityDate(new Date("2026-10-14T00:30:00.000Z"), "America/New_York")).toBe("2026-10-13");
    expect(activityDate(new Date("2026-10-14T23:30:00.000Z"), "Asia/Tokyo")).toBe("2026-10-15");
    expect(activityDate(new Date("2026-10-14T12:00:00.000Z"), "UTC")).toBe("2026-10-14");
  });
});