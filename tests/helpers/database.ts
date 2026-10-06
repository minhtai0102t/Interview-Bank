import { randomUUID } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

/** Removes every row from the application tables. Integration tests run against a database named "test". */
export async function resetDatabase(): Promise<void> {
  await getPrisma().$executeRaw`TRUNCATE TABLE "user", "topic", "verification", "rateLimit" RESTART IDENTITY CASCADE`;
}

export async function disconnectDatabase(): Promise<void> {
  await getPrisma().$disconnect();
}

let sequence = 0;

/** A value that is unique within one test run, for columns with unique constraints. */
export function uniqueSuffix(): string {
  sequence += 1;
  return `${Date.now().toString(36)}-${sequence}`;
}

export function createUser(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const id = overrides.id ?? `user-${randomUUID()}`;
  return getPrisma().user.create({
    data: { id, name: "Test User", email: `${id}@example.test`, emailVerified: true, ...overrides },
  });
}

export function createTopic(overrides: Partial<Prisma.TopicUncheckedCreateInput> = {}) {
  const suffix = uniqueSuffix();
  return getPrisma().topic.create({
    data: { slug: `topic-${suffix}`, label: `Topic ${suffix}`, sortOrder: 1, ...overrides },
  });
}

export async function createQuestion(overrides: Partial<Prisma.QuestionUncheckedCreateInput> = {}) {
  const topicId = overrides.topicId ?? (await createTopic()).id;
  return getPrisma().question.create({
    data: {
      title: "What is a closure?",
      promptMarkdown: "Explain what a closure is.",
      answerMarkdown: "A function together with the scope it was created in.",
      difficulty: "MEDIUM",
      tags: ["javascript"],
      ...overrides,
      topicId,
    },
  });
}

export function createRevision(
  question: { id: string; topicId: string },
  overrides: Partial<Prisma.QuestionRevisionUncheckedCreateInput> = {},
) {
  return getPrisma().questionRevision.create({
    data: {
      questionId: question.id,
      topicId: question.topicId,
      draftVersion: 1,
      title: "What is a closure?",
      promptMarkdown: "Explain what a closure is.",
      answerMarkdown: "A function together with the scope it was created in.",
      difficulty: "MEDIUM",
      tags: ["javascript"],
      ...overrides,
    },
  });
}
