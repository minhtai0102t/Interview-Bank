import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getProgressSnapshot } from "@/features/progress/service";
import { createPracticeSession, completePracticeSession, gradePracticeItem, revealPracticeAnswer, savePracticeResponse } from "@/features/practice/service";
import { publishQuestion, saveQuestion } from "@/features/questions/service";
import { getPrisma } from "@/lib/prisma";
import type { Actor } from "@/lib/actor";

import { createTopic, createUser, disconnectDatabase, resetDatabase } from "../helpers/database";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const prisma = getPrisma();

function actorFromUser(user: { id: string; name: string; role?: string }): Actor {
  return { userId: user.id, role: (user.role as Actor["role"] | undefined) ?? "USER", name: user.name };
}

async function createPublishedQuestion(owner: Actor, topicId: string, title: string) {
  const draft = await saveQuestion(owner, {
    title,
    promptMarkdown: `${title} prompt`,
    answerMarkdown: `${title} answer`,
    topicId,
    difficulty: "MEDIUM",
    tags: ["progress"],
  });

  return publishQuestion(owner, draft.id, draft.draftVersion);
}

describe("progress", () => {
  it("starts empty for a signed-in account", async () => {
    const owner = actorFromUser(await createUser({ name: "New Person" }));

    expect(await getProgressSnapshot(owner)).toMatchObject({
      timeZone: "UTC",
      summary: {
        completedSessions: 0,
        completedReviews: 0,
        dueReviews: 0,
        upcomingReviews: 0,
      },
      topicCoverage: [],
      recentSessions: [],
    });
  });

  it("aggregates due and upcoming reviews, topic coverage, recent sessions, and activity using the profile time zone", async () => {
    const owner = actorFromUser(await createUser({ name: "Progress Owner" }));
    await prisma.profile.create({ data: { userId: owner.userId, timeZone: "America/New_York", publicAlias: "Progress Owner" } });

    const algorithms = await createTopic({ slug: "algorithms", label: "Algorithms", sortOrder: 1 });
    const databases = await createTopic({ slug: "databases", label: "Databases", sortOrder: 2 });

    const reviewQuestion = await createPublishedQuestion(owner, algorithms.id, "Review question");
    const mockQuestion = await createPublishedQuestion(owner, algorithms.id, "Mock question");
    await createPublishedQuestion(owner, databases.id, "Database question");

    const reviewSession = await createPracticeSession(owner, { mode: "REVIEW", questionId: reviewQuestion.id, count: 1 });
    await revealPracticeAnswer(owner, reviewSession.items[0]!.id);
    await gradePracticeItem(owner, reviewSession.items[0]!.id, 3);

    const mockSession = await createPracticeSession(owner, { mode: "MOCK", questionId: mockQuestion.id, count: 1, timeLimitMinutes: 30 });
    await savePracticeResponse(owner, mockSession.items[0]!.id, "A mock response");
    await completePracticeSession(owner, mockSession.id);

    await prisma.practiceSession.update({
      where: { id: reviewSession.id },
      data: { startedAt: new Date("2026-10-14T00:10:00.000Z"), completedAt: new Date("2026-10-14T00:30:00.000Z") },
    });
    await prisma.practiceItem.update({
      where: { id: reviewSession.items[0]!.id },
      data: { reviewedAt: new Date("2026-10-14T00:30:00.000Z") },
    });
    await prisma.reviewCard.update({
      where: { userId_questionId: { userId: owner.userId, questionId: reviewQuestion.id } },
      data: { dueAt: new Date("2026-10-13T12:00:00.000Z") },
    });
    await prisma.practiceSession.update({
      where: { id: mockSession.id },
      data: { startedAt: new Date("2026-10-14T14:00:00.000Z"), completedAt: new Date("2026-10-14T15:00:00.000Z") },
    });
    await prisma.reviewCard.create({
      data: {
        userId: owner.userId,
        questionId: mockQuestion.id,
        dueAt: new Date("2099-01-15T12:00:00.000Z"),
        card: { dueAt: "2099-01-15T12:00:00.000Z", reps: 0 },
      },
    });

    const snapshot = await getProgressSnapshot(owner);

    expect(snapshot.timeZone).toBe("America/New_York");
    expect(snapshot.summary).toEqual({
      completedSessions: 2,
      completedReviews: 1,
      dueReviews: 1,
      upcomingReviews: 1,
    });
    expect(snapshot.topicCoverage).toEqual([
      expect.objectContaining({
        topicSlug: "algorithms",
        publishedQuestions: 2,
        currentStudiedQuestions: 2,
        historicalStudiedQuestions: 2,
        dueReviews: 1,
        upcomingReviews: 1,
      }),
      expect.objectContaining({
        topicSlug: "databases",
        publishedQuestions: 1,
        currentStudiedQuestions: 0,
        historicalStudiedQuestions: 0,
        dueReviews: 0,
        upcomingReviews: 0,
      }),
    ]);
    expect(snapshot.recentSessions.map((session) => session.mode)).toEqual(["MOCK", "REVIEW"]);
    expect(snapshot.activity.days.find((day) => day.date === "2026-10-13")).toMatchObject({ count: 1 });
  });

  it("keeps historical study on the practiced revision topic while live review inventory follows the current published topic", async () => {
    const owner = actorFromUser(await createUser({ name: "Republished Progress Owner" }));
    const originalTopic = await createTopic({ slug: "algorithms", label: "Algorithms", sortOrder: 1 });
    const currentTopic = await createTopic({ slug: "system-design", label: "System Design", sortOrder: 2 });

    const published = await createPublishedQuestion(owner, originalTopic.id, "Republished question");

    const reviewSession = await createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 });
    await revealPracticeAnswer(owner, reviewSession.items[0]!.id);
    await gradePracticeItem(owner, reviewSession.items[0]!.id, 3);

    const updatedDraft = await saveQuestion(
      owner,
      {
        title: "Republished question",
        promptMarkdown: "Republished question prompt",
        answerMarkdown: "Republished question answer",
        topicId: currentTopic.id,
        difficulty: "MEDIUM",
        tags: ["progress"],
      },
      published.id,
      published.draftVersion,
    );
    await publishQuestion(owner, updatedDraft.id, updatedDraft.draftVersion);

    await prisma.reviewCard.update({
      where: { userId_questionId: { userId: owner.userId, questionId: published.id } },
      data: { dueAt: new Date("2026-10-13T12:00:00.000Z") },
    });

    const snapshot = await getProgressSnapshot(owner);
    const historicalTopic = snapshot.topicCoverage.find((topic) => topic.topicSlug === "algorithms");
    const visibleTopic = snapshot.topicCoverage.find((topic) => topic.topicSlug === "system-design");

    expect(snapshot.summary).toMatchObject({ dueReviews: 1, upcomingReviews: 0 });
    expect(historicalTopic).toMatchObject({
      topicSlug: "algorithms",
      publishedQuestions: 0,
      currentStudiedQuestions: 0,
      historicalStudiedQuestions: 1,
      dueReviews: 0,
      upcomingReviews: 0,
    });
    expect(visibleTopic).toMatchObject({
      topicSlug: "system-design",
      publishedQuestions: 1,
      currentStudiedQuestions: 1,
      historicalStudiedQuestions: 0,
      dueReviews: 1,
      upcomingReviews: 0,
    });
  });
});