import type { ModerationState } from "@/generated/prisma/client";
import type { Actor } from "@/lib/actor";
import { requireAdmin } from "@/lib/actor";
import { DomainError } from "@/lib/errors";
import { getPrisma } from "@/lib/prisma";

export interface ModerationQuestionSummary {
  id: string;
  title: string;
  authorAlias: string;
  topicLabel: string;
  difficulty: string;
  moderationState: ModerationState;
  publishedAt: Date | null;
  updatedAt: Date;
}

function notFound(message = "Question not found."): never {
  throw new DomainError("NOT_FOUND", message);
}

function conflict(message: string): never {
  throw new DomainError("CONFLICT", message);
}

function authorAliasFrom(record: { author: { profile: { publicAlias: string | null } | null } | null }): string {
  const alias = record.author?.profile?.publicAlias?.trim();
  return alias ? alias : "Anonymous";
}

export async function listModerationQuestions(actor: Actor | null): Promise<ModerationQuestionSummary[]> {
  requireAdmin(actor);

  const questions = await getPrisma().question.findMany({
    where: { currentPublishedRevisionId: { not: null } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      moderationState: true,
      updatedAt: true,
      author: { select: { profile: { select: { publicAlias: true } } } },
      currentPublishedRevision: {
        select: {
          title: true,
          difficulty: true,
          publishedAt: true,
          topic: { select: { label: true } },
        },
      },
    },
  });

  return questions.flatMap((question) => {
    if (!question.currentPublishedRevision) return [];
    return [{
      id: question.id,
      title: question.currentPublishedRevision.title,
      authorAlias: authorAliasFrom(question),
      topicLabel: question.currentPublishedRevision.topic.label,
      difficulty: question.currentPublishedRevision.difficulty,
      moderationState: question.moderationState,
      publishedAt: question.currentPublishedRevision.publishedAt,
      updatedAt: question.updatedAt,
    }];
  });
}

export async function moderateQuestion(actor: Actor | null, questionId: string, state: ModerationState): Promise<void> {
  requireAdmin(actor);

  await getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "question"
      WHERE "id" = ${questionId}::uuid
      FOR UPDATE
    `;

    if (rows.length === 0) notFound();

    const updated = await tx.question.updateMany({
      where: { id: questionId, archivedAt: null, currentPublishedRevisionId: { not: null } },
      data: { moderationState: state },
    });
    if (updated.count > 0) return;

    const question = await tx.question.findUnique({
      where: { id: questionId },
      select: { archivedAt: true, currentPublishedRevisionId: true },
    });
    if (!question) notFound();
    if (question.archivedAt) conflict("Archived questions cannot be moderated.");
    notFound();
  });
}