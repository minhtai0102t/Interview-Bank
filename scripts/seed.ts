import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import { STARTER_BANK, STARTER_QUESTION_COUNT, STARTER_TOPIC_COUNT } from "@/features/questions/starter-bank";
import { getPrisma } from "@/lib/prisma";

const SEEDED_AT = new Date("2026-10-14T00:00:00.000Z");

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export interface SeedResult {
  topicCount: number;
  questionCount: number;
  createdTopics: number;
  createdQuestions: number;
}

function throwStarterTopicConflict(topic: { id: string; slug: string }, existing: { id: string; slug: string }): never {
  throw new Error(
    `Starter topic conflict for slug "${topic.slug}" and stable id "${topic.id}": found existing topic id "${existing.id}" with slug "${existing.slug}". Resolve the collision before running pnpm db:seed.`,
  );
}

export async function seedStarterBank(): Promise<SeedResult> {
  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    let createdTopics = 0;
    let createdQuestions = 0;
    const topicIdsBySlug = new Map<string, string>();

    const starterTopicIds = STARTER_BANK.map((topic) => topic.id);
    const starterTopicSlugs = STARTER_BANK.map((topic) => topic.slug);
    const existingTopics = await tx.topic.findMany({
      where: {
        OR: [
          { id: { in: starterTopicIds } },
          { slug: { in: starterTopicSlugs } },
        ],
      },
      select: { id: true, slug: true },
    });
    const existingById = new Map(existingTopics.map((topic) => [topic.id, topic]));
    const existingBySlug = new Map(existingTopics.map((topic) => [topic.slug, topic]));

    for (const topic of STARTER_BANK) {
      const existingByStableId = existingById.get(topic.id);
      const existingByStableSlug = existingBySlug.get(topic.slug);

      if (!existingByStableId && !existingByStableSlug) continue;
      if (!existingByStableId || !existingByStableSlug) {
        throwStarterTopicConflict(topic, existingByStableId ?? existingByStableSlug!);
      }
      if (existingByStableId.id !== existingByStableSlug.id) {
        throwStarterTopicConflict(topic, existingByStableSlug);
      }
    }

    for (const topic of STARTER_BANK) {
      const existing = existingById.get(topic.id);
      if (existing) {
        topicIdsBySlug.set(topic.slug, existing.id);
        continue;
      }

      await tx.topic.create({
        data: {
          id: topic.id,
          slug: topic.slug,
          label: topic.label,
          sortOrder: topic.sortOrder,
        },
      });
      createdTopics += 1;
      topicIdsBySlug.set(topic.slug, topic.id);
    }

    for (const topic of STARTER_BANK) {
      const topicId = topicIdsBySlug.get(topic.slug);
      if (!topicId) throw new Error(`Missing topic id for ${topic.slug}.`);

      for (const question of topic.questions) {
        const existingQuestion = await tx.question.findUnique({ where: { id: question.id }, select: { id: true } });
        if (existingQuestion) continue;

        await tx.question.create({
          data: {
            id: question.id,
            authorId: null,
            title: question.title,
            promptMarkdown: question.promptMarkdown,
            answerMarkdown: question.answerMarkdown,
            topicId,
            difficulty: question.difficulty,
            tags: question.tags,
            draftVersion: 1,
            currentPublishedRevisionId: null,
            archivedAt: null,
            moderationState: "ACTIVE",
            createdAt: SEEDED_AT,
            updatedAt: SEEDED_AT,
          },
        });

        await tx.questionRevision.create({
          data: {
            id: question.revisionId,
            questionId: question.id,
            draftVersion: 1,
            title: question.title,
            promptMarkdown: question.promptMarkdown,
            answerMarkdown: question.answerMarkdown,
            topicId,
            difficulty: question.difficulty,
            tags: question.tags,
            createdAt: SEEDED_AT,
            publishedAt: SEEDED_AT,
          },
        });

        await tx.question.update({
          where: { id: question.id },
          data: { currentPublishedRevisionId: question.revisionId },
        });

        createdQuestions += 1;
      }
    }

    return {
      topicCount: STARTER_TOPIC_COUNT,
      questionCount: STARTER_QUESTION_COUNT,
      createdTopics,
      createdQuestions,
    } satisfies SeedResult;
  });

  return result;
}

async function main(): Promise<void> {
  const result = await seedStarterBank();
  console.log(
    `Starter bank ready: ${result.questionCount} questions across ${result.topicCount} topics (${result.createdQuestions} questions and ${result.createdTopics} topics created this run).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    async () => {
      await getPrisma().$disconnect();
    },
    async (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      await getPrisma().$disconnect();
      process.exitCode = 1;
    },
  );
}