import { describe, expect, it } from "vitest";
import { Rating } from "ts-fsrs";

import { scheduleReview } from "./scheduler";

describe("scheduleReview", () => {
  it("creates a JSON-safe FSRS card for a new review", () => {
    const now = new Date("2026-10-14T12:00:00.000Z");

    const scheduled = scheduleReview(null, Rating.Good, now);

    expect(scheduled.dueAt.getTime()).toBeGreaterThan(now.getTime());
    expect(scheduled.card).toMatchObject({
      reps: 1,
      lapses: 0,
      state: expect.any(Number),
      stability: expect.any(Number),
      difficulty: expect.any(Number),
      elapsed_days: expect.any(Number),
      scheduled_days: expect.any(Number),
      learning_steps: expect.any(Number),
    });
    expect(typeof scheduled.card.due).toBe("string");
    expect(typeof scheduled.card.last_review).toBe("string");
    expect(new Date(scheduled.card.due).toISOString()).toBe(scheduled.dueAt.toISOString());
  });

  it("deserializes stored card dates explicitly and preserves numeric fields", () => {
    const now = new Date("2026-10-14T12:30:00.000Z");
    const stored = {
      due: "2026-10-13T09:15:00.000Z",
      stability: 12.5,
      difficulty: 6.4,
      elapsed_days: 2,
      scheduled_days: 10,
      learning_steps: 1,
      reps: 3,
      lapses: 1,
      state: 2,
      last_review: "2026-10-11T09:15:00.000Z",
    };

    const scheduled = scheduleReview(stored, Rating.Easy, now);

    expect(scheduled.card).toMatchObject({
      stability: expect.any(Number),
      difficulty: expect.any(Number),
      elapsed_days: expect.any(Number),
      scheduled_days: expect.any(Number),
      learning_steps: expect.any(Number),
      reps: expect.any(Number),
      lapses: expect.any(Number),
      state: expect.any(Number),
    });
    expect(Number.isFinite(scheduled.card.stability)).toBe(true);
    expect(Number.isFinite(scheduled.card.difficulty)).toBe(true);
    expect(Number.isInteger(scheduled.card.reps)).toBe(true);
    expect(Number.isInteger(scheduled.card.lapses)).toBe(true);
    expect(new Date(scheduled.card.due).toISOString()).toBe(scheduled.dueAt.toISOString());
    expect(scheduled.card.last_review).toBe(now.toISOString());
  });
});