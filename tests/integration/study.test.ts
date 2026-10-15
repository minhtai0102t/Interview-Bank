import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { QuestionInput } from "@/features/questions/input";
import { saveCollection, setCollectionQuestion } from "@/features/collections/service";
import { archiveQuestion, publishQuestion, saveQuestion, unpublishQuestion } from "@/features/questions/service";
import {
  completePracticeSession,
  createPracticeSession,
  getPracticeOverview,
  getPracticeSession,
  gradePracticeItem,
  revealPracticeAnswer,
  savePracticeResponse,
  setPracticeSessionPosition,
} from "@/features/practice/service";
import type { Actor } from "@/lib/actor";
import type { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

import {
  createTopic,
  createUser,
  disconnectDatabase,
  resetDatabase,
} from "../helpers/database";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const prisma = getPrisma();

function actorFromUser(user: { id: string; name: string }): Actor {
  return { userId: user.id, role: "USER", name: user.name };
}

async function createPublishedQuestion(owner: Actor, overrides: Partial<QuestionInput> = {}) {
  const topic = overrides.topicId ? null : await createTopic();
  const draft = await saveQuestion(owner, {
    title: "What is optimistic concurrency?",
    promptMarkdown: "Explain optimistic concurrency.",
    answerMarkdown: "Accept changes only when the expected version still matches.",
    topicId: overrides.topicId ?? topic!.id,
    difficulty: "MEDIUM",
    tags: ["concurrency"],
    ...overrides,
  });

  return publishQuestion(owner, draft.id, draft.draftVersion);
}

async function createReviewCard(userId: string, questionId: string, dueAt: string) {
  await prisma.reviewCard.create({
    data: {
      userId,
      questionId,
      dueAt: new Date(dueAt),
      card: { dueAt, reps: 1 },
    },
  });
}

describe("practice study", () => {
  it("owner-filters sessions and keeps the published revision snapshot after the source changes", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const other = actorFromUser(await createUser({ name: "Other" }));
    const published = await createPublishedQuestion(owner);

    const session = await createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 });
    const originalItem = session.items[0]!;

    await saveQuestion(
      owner,
      {
        title: "What is optimistic concurrency?",
        promptMarkdown: "Explain optimistic concurrency.",
        answerMarkdown: "A later private edit should not rewrite existing study history.",
        topicId: published.topicId,
        difficulty: "MEDIUM",
        tags: ["concurrency"],
      },
      published.id,
      published.draftVersion,
    );
    await unpublishQuestion(owner, published.id);

    const resumed = await getPracticeSession(owner, session.id);

    expect(resumed.items[0]).toMatchObject({
      id: originalItem.id,
      revisionId: originalItem.revisionId,
      answerMarkdown: "Accept changes only when the expected version still matches.",
    });
    await expect(getPracticeSession(other, session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("grades a review item idempotently on retry", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const published = await createPublishedQuestion(owner);
    const session = await createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 });
    const item = session.items[0]!;

    await gradePracticeItem(owner, item.id, 3);
    await gradePracticeItem(owner, item.id, 3);

    expect(await prisma.reviewCard.count({ where: { userId: owner.userId } })).toBe(1);
    expect((await prisma.reviewCard.findFirstOrThrow({ where: { userId: owner.userId } })).card).toMatchObject({ reps: 1 });
  });

  it("serializes concurrent grades for the same question across sessions", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const published = await createPublishedQuestion(owner);
    const [first, second] = await Promise.all([
      createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 }),
      createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 }),
    ]);

    await Promise.all([
      gradePracticeItem(owner, first.items[0]!.id, 3),
      gradePracticeItem(owner, second.items[0]!.id, 3),
    ]);

    expect((await prisma.reviewCard.findFirstOrThrow({ where: { userId: owner.userId, questionId: published.id } })).card).toMatchObject({
      reps: 2,
    });
  });

  it("prioritizes oldest due review cards before new questions and excludes future cards inside a topic", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const systems = await createTopic({ slug: "systems", label: "Systems", sortOrder: 1 });
    const frontend = await createTopic({ slug: "frontend", label: "Frontend", sortOrder: 2 });
    const dueOldest = await createPublishedQuestion(owner, { title: "Due oldest", topicId: systems.id });
    const dueRecent = await createPublishedQuestion(owner, { title: "Due recent", topicId: systems.id });
    const future = await createPublishedQuestion(owner, { title: "Future review", topicId: systems.id });
    const fresh = await createPublishedQuestion(owner, { title: "Fresh question", topicId: systems.id });
    const otherTopicDue = await createPublishedQuestion(owner, { title: "Other topic due", topicId: frontend.id });

    await createReviewCard(owner.userId, dueOldest.id, "2026-01-01T00:00:00.000Z");
    await createReviewCard(owner.userId, dueRecent.id, "2026-06-01T00:00:00.000Z");
    await createReviewCard(owner.userId, future.id, "2099-01-01T00:00:00.000Z");
    await createReviewCard(owner.userId, otherTopicDue.id, "2025-01-01T00:00:00.000Z");

    const session = await createPracticeSession(owner, { mode: "REVIEW", topicId: systems.id, count: 10 });

    expect(session.items.map((item) => item.questionId)).toEqual([dueOldest.id, dueRecent.id, fresh.id]);
  });

  it("restricts automatic review queues to eligible due and new questions within the selected collection", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic({ slug: "backend", label: "Backend", sortOrder: 1 });
    const dueInCollection = await createPublishedQuestion(owner, { title: "Due in collection", topicId: topic.id });
    const futureInCollection = await createPublishedQuestion(owner, { title: "Future in collection", topicId: topic.id });
    const newInCollection = await createPublishedQuestion(owner, { title: "New in collection", topicId: topic.id });
    const dueOutsideCollection = await createPublishedQuestion(owner, { title: "Due outside collection", topicId: topic.id });
    const collection = await saveCollection(owner, { name: "Round 1", description: "Selection" });

    await setCollectionQuestion(owner, collection.id, dueInCollection.id, true);
    await setCollectionQuestion(owner, collection.id, futureInCollection.id, true);
    await setCollectionQuestion(owner, collection.id, newInCollection.id, true);

    await createReviewCard(owner.userId, dueInCollection.id, "2026-04-01T00:00:00.000Z");
    await createReviewCard(owner.userId, futureInCollection.id, "2099-05-01T00:00:00.000Z");
    await createReviewCard(owner.userId, dueOutsideCollection.id, "2026-03-01T00:00:00.000Z");

    const session = await createPracticeSession(owner, { mode: "REVIEW", collectionId: collection.id, count: 10 });

    expect(session.items.map((item) => item.questionId)).toEqual([dueInCollection.id, newInCollection.id]);
  });

  it("counts only visible due and new questions in the practice overview", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const visibleDue = await createPublishedQuestion(owner, { title: "Visible due" });
    const hiddenDue = await createPublishedQuestion(owner, { title: "Hidden due" });
    const visibleNew = await createPublishedQuestion(owner, { title: "Visible new" });
    const hiddenNew = await createPublishedQuestion(owner, { title: "Hidden new" });

    await createReviewCard(owner.userId, visibleDue.id, "2026-02-01T00:00:00.000Z");
    await createReviewCard(owner.userId, hiddenDue.id, "2026-02-02T00:00:00.000Z");
    await unpublishQuestion(owner, hiddenDue.id);
    await unpublishQuestion(owner, hiddenNew.id);

    const overview = await getPracticeOverview(owner);

    expect(overview).toEqual({ dueCount: 1, newCount: 1 });
    expect([visibleDue.id, visibleNew.id]).toContain(visibleDue.id);
  });

  it("rejects direct review completion until every item has been revealed and graded", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic({ slug: "algorithms", label: "Algorithms", sortOrder: 1 });
    await createPublishedQuestion(owner, { title: "First review question", topicId: topic.id });
    await createPublishedQuestion(owner, { title: "Second review question", topicId: topic.id });

    const session = await createPracticeSession(owner, { mode: "REVIEW", topicId: topic.id, count: 2 });

    await expect(completePracticeSession(owner, session.id)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );

    await revealPracticeAnswer(owner, session.items[0]!.id);

    await expect(completePracticeSession(owner, session.id)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );

    await gradePracticeItem(owner, session.items[0]!.id, 3);

    await expect(completePracticeSession(owner, session.id)).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );

    await revealPracticeAnswer(owner, session.items[1]!.id);
    await gradePracticeItem(owner, session.items[1]!.id, 4);

    const completed = await getPracticeSession(owner, session.id);
    expect(completed.completedAt).toBeInstanceOf(Date);
  });

  it("rejects writes after a session expires or completes", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const published = await createPublishedQuestion(owner);
    const expired = await createPracticeSession(owner, { mode: "MOCK", questionId: published.id, count: 1, timeLimitMinutes: 1 });

    await prisma.practiceSession.update({
      where: { id: expired.id },
      data: { startedAt: new Date("2000-01-01T00:00:00.000Z") },
    });

    await expect(savePracticeResponse(owner, expired.items[0]!.id, "Late answer")).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );

    const completed = await createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 });
    await revealPracticeAnswer(owner, completed.items[0]!.id);
    await gradePracticeItem(owner, completed.items[0]!.id, 3);

    await expect(savePracticeResponse(owner, completed.items[0]!.id, "Stale answer")).rejects.toThrow(
      expect.objectContaining<Partial<DomainError>>({ code: "CONFLICT" }),
    );
  });

  it("does not admit archived or unpublished questions into new sessions", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const published = await createPublishedQuestion(owner);

    await archiveQuestion(owner, published.id);

    await expect(
      createPracticeSession(owner, { mode: "REVIEW", questionId: published.id, count: 1 }),
    ).rejects.toThrow(expect.objectContaining<Partial<DomainError>>({ code: "NOT_FOUND" }));
  });

  it("persists mock responses, answer reveal, and the active cursor across reloads", async () => {
    const owner = actorFromUser(await createUser({ name: "Owner" }));
    const topic = await createTopic({ slug: "systems", label: "Systems", sortOrder: 1 });
    await createPublishedQuestion(owner, {
      title: "First mock question",
      promptMarkdown: "Question one",
      answerMarkdown: "Answer one",
      topicId: topic.id,
    });
    await createPublishedQuestion(owner, {
      title: "Second mock question",
      promptMarkdown: "Question two",
      answerMarkdown: "Answer two",
      topicId: topic.id,
    });

    const session = await createPracticeSession(owner, { mode: "MOCK", topicId: topic.id, count: 2, timeLimitMinutes: 15 });

    expect(session.currentPosition).toBe(1);
    await savePracticeResponse(owner, session.items[0]!.id, "Draft answer");
    await revealPracticeAnswer(owner, session.items[0]!.id);
    await setPracticeSessionPosition(owner, session.id, 2);

    const resumed = await getPracticeSession(owner, session.id);

    expect(resumed.currentPosition).toBe(2);
    expect(resumed.items[0]).toMatchObject({ responseMarkdown: "Draft answer" });
    expect(resumed.items[0]!.revealedAt).toBeInstanceOf(Date);
  });
});